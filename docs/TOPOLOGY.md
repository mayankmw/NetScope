# Network Topology

> Status: **Step 8.** Page: `/topology`. Data: `GET /api/devices` and the WebSocket device events
> ([API](API.md)); no endpoint of its own.

The topology page draws the local network as an interactive graph: the gateway, and every
discovered device around it. You can pan and zoom, search, select a device to see its details,
and open its page. The graph updates live.

## 1. What the graph claims, and what it does not

NetScope knows:

- the subnet this computer is on, and which device is its **gateway** (the default route, with its
  MAC from the ARP cache);
- every device discovery found on that subnet: IP, MAC, hostname, vendor, type, online or offline.

NetScope does **not** know how devices are physically connected. Discovery sees no switches,
cables, access points, mesh nodes, or Wi-Fi associations. So the graph is a **logical topology**:

```
            Gateway  (the default route)
               ┊       logical edge: "on the gateway's subnet, reaches other networks through it"
   ┌───────┬───┴───┬───────┐
 device  device  device  device   (every discovered device)
```

Every edge has `kind: "logical"`. Edges are dashed, and the page says, next to the graph, that the
lines are not cables or Wi-Fi links. A device that sits behind a switch or an access point still
appears directly under the gateway: the graph does not invent intermediate hops it cannot prove.

## 2. Data model

`buildTopologyModel()` (`client/src/utils/topology.js`) is a pure function of the device
inventory. It knows nothing about React or Cytoscape, and it is unit-tested.

```js
TopologyModel = {
  model: 'logical',
  network: { id, cidr, gatewayIpAddress, interfaceName },
  rootId,                 // the gateway node
  nodes: TopologyNode[],  // gateway first, then devices in display order
  edges: TopologyEdge[],  // one per device: gateway → device
  counts: { devices, online, offline, hidden },
}

TopologyNode = {
  id,                     // device id, or "gateway:<networkId>" (see below)
  kind: 'gateway' | 'device',
  category: 'gateway' | 'computer' | 'mobile' | 'iot' | 'network' | 'other',
  name, ipAddress, hostname, vendor, deviceType, typeLabel,
  status: 'online' | 'offline' | 'unknown',
  isGateway, isSelf, isNew, synthetic,
  lastSeenAt,
  order,                  // position in the layout
}

TopologyEdge = { id, source: rootId, target: deviceId, kind: 'logical', relation: 'subnet-via-gateway' }
```

| Rule           | Detail                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root           | The device with `isGateway`. If the gateway is not in the inventory yet, a `synthetic` stand-in is built from the network's gateway IP (drawn dotted; no device page).      |
| Categories     | From the device type: computer/server/NAS → `computer`; phone/tablet → `mobile`; TV/speaker/camera/IoT/console/printer → `iot`; router/AP/switch → `network`; else `other`. |
| Order          | This computer first, then by category, then by IP, so similar devices sit together and the same inventory always looks the same.                                            |
| `isSelf`       | The machine NetScope runs on: the server compares MACs with its own interfaces (`GET /api/devices` and device events carry it).                                             |
| `isNew`        | First seen in the last 24 hours.                                                                                                                                            |
| Offline filter | "Offline devices" off removes them from the model (`counts.hidden`); the gateway always stays as the root.                                                                  |

**Why no `/api/network/topology` endpoint.** Everything the graph needs is in the device inventory,
which the client already holds and the WebSocket already keeps current. Building the model in the
browser means no second copy of the data and no second live-update path. A server endpoint becomes
worthwhile only with real link data (for example LLDP or SNMP from managed switches), which
NetScope does not collect.

## 3. Cytoscape architecture

```
useDeviceInventory + device store (REST snapshot + WebSocket events)
        │ devices
        ▼
useTopology()             model = buildTopologyModel(...)      (memoized)
        │                 search matches, selection, layout and offline preferences
        ▼
TopologyPage ── TopologyToolbar · TopologyNodePanel · TopologyLegend · TopologyList (list view)
        │
        ▼
TopologyGraph ── useCytoscape(container)        one instance per mount: lazy import, events, resize
              └─ useTopologyGraph(cy, model)    model → element definitions → syncGraph (diff)
                                                layout on structure change · classes for search,
                                                selection, live flash · zoom/fit/focus controls
```

| Module                                | Responsibility                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/topology.js`                   | The model (pure).                                                                                                                                             |
| `hooks/useTopology.js`                | Inventory → model, search, selection, remembered layout and offline preference (`useUiStore`).                                                                |
| `hooks/useCytoscape.js`               | Creates the instance once (Cytoscape is imported on first use), wires tap / double-tap / background tap / hover, follows container size, destroys on unmount. |
| `hooks/useTopologyGraph.js`           | Applies the model by diff, runs layouts, highlights, flashes live changes, exposes `zoomIn`, `zoomOut`, `fit`, `relayout`, `focus(ids)`.                      |
| `components/topology/graphSync.js`    | Model → element definitions; `syncGraph` (add / update / remove in one batch); `applyHighlights`.                                                             |
| `components/topology/graphStyle.js`   | The stylesheet: shape per category, status and role styles, logical (dashed) edges, interaction states.                                                       |
| `components/topology/graphLayouts.js` | Radial and tree positions, the auto-fit viewport, `runLayout`.                                                                                                |
| `components/topology/graphTheme.js`   | Theme tokens → rgb() for the canvas (the theme uses oklch(), which Cytoscape cannot parse).                                                                   |
| `components/topology/nodeIcons.js`    | Device type icons as SVG data URIs, from the framework-free `lucide` package (same icons as the rest of the UI).                                              |

**Styling.** Data-driven selectors only (`node[category = "mobile"]`, `node[status = "offline"]`,
`node[?isGateway]`, `node[?isSelf]`, `node[?isNew]`), so a device changing state restyles itself;
no per-node style calls. Classes carry interaction state: `hover`, `match`, `faded`, `changed`,
`:selected`, `active` (edges of the selection), `taxi` (tree routing).

| Shape          | Category                    | Outline                                   |
| -------------- | --------------------------- | ----------------------------------------- |
| Round diamond  | Gateway (larger, glowing)   | Cyan: online                              |
| Round square   | Computers, servers, NAS     | Grey, dashed, faded: offline at last scan |
| Circle         | Phones and tablets          | Green: this computer                      |
| Round hexagon  | Smart home, media, printers | Magenta ring: new in the last 24 hours    |
| Round octagon  | Network equipment           | Dotted: gateway not in the inventory yet  |
| Round pentagon | Other and unknown           |                                           |

**Interaction.** Drag to pan, wheel or pinch to zoom (0.15×–3×), drag nodes to rearrange. Tap a
node to select it (details panel, edges highlighted); double-tap to open its device page; tap the
background or press Escape to clear the selection. Buttons: zoom in, zoom out, fit, arrange again.
Search highlights matches and fades the rest; Enter (or "Show") brings the matches into view.
Layouts: **Radial** (gateway in the centre, rings) and **Tree** (gateway on top, rows below,
edges branching from a trunk).

**Accessibility.** The canvas has an `aria-label` describing the graph. The **List** view shows the
same structure as nested lists (gateway → devices by category) of links, usable with a keyboard
and a screen reader. "/" focuses search.

## 4. Live updates

The device store applies WebSocket events (`device.discovered / updated / online / offline`,
`discovery.completed`). The model is rebuilt from the store, and the graph applies the difference:

| Change                                     | Graph work                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Status, name, type, IP of a device changes | That node's data (and its edge's) is replaced; style updates; nothing moves. The node flashes for 2.5 s.             |
| A device appears or disappears             | Nodes and edges added or removed; one layout (animated), after the burst of events of one discovery settles (80 ms). |
| Layout switched                            | Layout runs; edge routing switches.                                                                                  |
| Search or selection changes                | Classes only.                                                                                                        |
| Nothing relevant changed (e.g. the clock)  | Nothing: element signatures match.                                                                                   |

After a WebSocket reconnection the store reloads the inventory, and the same diff applies.

## 5. Performance

- **Loaded only when needed.** Cytoscape and the icon data form their own chunk (`graph`, ~440 kB,
  ~140 kB gzipped), fetched with the topology page. It is excluded from the `vendor` chunk.
- **One instance.** Created on mount, destroyed on unmount; never recreated for data changes.
  Handlers are read through a ref, so changing them does not touch the instance.
- **Diff, not rebuild.** Each element keeps a signature of its data; unchanged elements are not
  touched. All changes are applied in one `cy.batch()` (one redraw).
- **No physics.** Both layouts compute positions directly (O(n), deterministic) and use
  Cytoscape's `preset` layout; force-directed layouts (O(n²) per iteration) are not used. Layouts
  run only for structural changes or a layout switch, debounced during event bursts.
- **Rendering.** Labels below a readable size are not drawn (`min-zoomed-font-size`); the canvas
  pixel ratio is capped at 2; animations are off above 300 nodes and for users who prefer reduced
  motion. Icons are cached per type and color.
- **Resize.** A ResizeObserver resizes the canvas, coalesced per animation frame; resizing never
  re-runs the layout.
- **Scale.** Networks hold at most ~1,000 devices (sweeps are capped at a /22). Building the model
  is O(n log n) (sorting); the rest is O(n).

## 6. Limitations

- Physical links, switch ports, access points, and Wi-Fi associations are unknown, so they are
  not drawn.
- Only the current network (the one this computer is on, or was last on) is shown.
- Positions are computed, not saved: dragged nodes return to their place when the layout runs again.
