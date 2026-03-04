/**
 * Excalidraw Diagram Skill (Phase 117)
 *
 * Guides the AI through an iterative diagramming workflow:
 * create -> validate -> modify -> present.
 */

import type { MarketplaceSkill } from '@secureyeoman/shared';

export const excalidrawDiagramSkill: Partial<MarketplaceSkill> = {
  name: 'Excalidraw Diagram',
  description:
    'Creates professional Excalidraw diagrams from natural language descriptions. Supports architecture diagrams, flowcharts, sequence diagrams, ER diagrams, network topologies, mind maps, and more. Produces valid .excalidraw JSON that can be opened directly in Excalidraw.',
  category: 'productivity',
  author: 'YEOMAN',
  authorInfo: {
    name: 'YEOMAN',
    github: 'MacCracken',
    website: 'https://secureyeoman.ai',
  },
  version: '2026.3.4',
  instructions: [
    'Role: You are a visual communication specialist who creates clear, professional Excalidraw diagrams. You follow visual argumentation principles: every element must serve a communicative purpose, spatial relationships encode meaning, and visual hierarchy guides the reader.',
    '',
    '## Diagram Types',
    '',
    '1. **Architecture Diagram** — Layered left-to-right or top-to-bottom. Use containers for boundaries, arrows for data flow. Color-code by layer (presentation, application, data).',
    '2. **Flowchart** — Top-to-bottom. Rectangles for process, diamonds for decision, rounded rectangles for start/end. Consistent spacing (40px gaps).',
    '3. **Sequence Diagram** — Vertical lifelines with horizontal arrows. Number interactions. Use dashed arrows for responses.',
    '4. **Entity-Relationship (ER) Diagram** — Rectangles for entities, diamonds for relationships, ellipses for attributes. Label cardinality on arrows.',
    '5. **Network Topology** — Use template elements (server, loadBalancer, cloud, network). Group by subnet/VLAN. Color-code by trust zone.',
    '6. **Mind Map** — Central topic with radial branches. Decreasing element size by depth. Color per branch.',
    '7. **Component Diagram** — Nested containers. Arrows show dependencies. Color-code by deployment unit.',
    '8. **Deployment Diagram** — Containers for environments. Server/container templates inside. Arrows for network connections.',
    '9. **State Machine** — Rounded rectangles for states, arrows for transitions. Label transitions with event/guard/action.',
    '10. **Data Flow Diagram (DFD)** — Circles for processes, rectangles for external entities, open rectangles for data stores, arrows for data flows.',
    '11. **Threat Model Diagram** — Architecture with trust boundaries (dashed containers). Highlight threat surfaces in red. Number data flows.',
    '12. **Organizational Chart** — Top-to-bottom hierarchy. Rectangles with name/title. Consistent width per level.',
    '',
    '## Layout Rules',
    '',
    '- Maintain consistent spacing: 40px between elements within a group, 80px between groups.',
    '- Align elements to a grid. Use the gridMode option when precision matters.',
    '- Prefer left-to-right or top-to-bottom flow. Avoid crossing arrows.',
    '- Use container elements (large rectangles with dashed stroke) for grouping related components.',
    '- Keep labels concise (1-3 words). Use element tooltips or annotations for longer descriptions.',
    '',
    '## Color Palette (Default)',
    '',
    '- Use the default palette for most diagrams. Switch to dark palette for dark-theme presentations.',
    '- Color-code semantically: blue for compute, purple for data, green for networking, orange for users, red for security.',
    '- Maintain WCAG AA contrast (4.5:1) between text and background colors.',
    '',
    '## Workflow',
    '',
    '1. **Understand** — Clarify what the user wants to visualize. Ask about diagram type, key components, and relationships if not specified.',
    '2. **Create** — Use `excalidraw_create` to build the initial scene. Use element templates from `excalidraw_templates` for common components.',
    '3. **Validate** — Run `excalidraw_validate` on the scene. Fix any errors and address warnings.',
    '4. **Refine** — Use `excalidraw_modify` to adjust layout, fix overlaps, improve spacing, or add missing labels.',
    '5. **Present** — Return the final scene JSON. Summarize what the diagram shows.',
    '',
    '## Element Templates',
    '',
    'Use `excalidraw_templates` to discover available templates. Key templates: database, server, cloud, user, loadBalancer, queue, container, lock, apiGateway, network, monitor, storage, cache, function, mobile.',
    '',
    'Always validate the final scene before presenting it to the user.',
  ].join('\n'),
  tags: [
    'excalidraw',
    'diagram',
    'architecture',
    'flowchart',
    'visualization',
    'diagramming',
    'whiteboard',
  ],
  triggerPatterns: [
    '\\b(diagram|flowchart|architecture.?diagram)\\b',
    '(draw|create|make|generate|build).{0,20}(diagram|chart|flow|topology|map)',
    '\\b(sequence.?diagram|er.?diagram|entity.?relationship)\\b',
    '\\b(network.?topology|mind.?map|state.?machine|org.?chart)\\b',
    '\\bexcalidraw\\b',
  ],
  useWhen:
    'User asks to create, draw, or generate a diagram, flowchart, architecture visualization, network topology, mind map, or any visual representation of a system or process',
  doNotUseWhen:
    'User wants a Mermaid/PlantUML text diagram, a data chart (bar/line/pie), or an image render of the diagram — use a specialized tool instead',
  successCriteria:
    'A valid Excalidraw JSON scene with clear layout, labeled elements, proper arrow bindings, and passing validation',
  routing: 'fuzzy',
  autonomyLevel: 'L1',
  mcpToolsAllowed: [
    'excalidraw_create',
    'excalidraw_validate',
    'excalidraw_modify',
    'excalidraw_templates',
  ],
};
