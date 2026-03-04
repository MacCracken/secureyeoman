import { describe, it, expect } from 'vitest';
import { specToElement, buildScene, validateScene, patchScene } from './excalidraw-scene.js';
import type { ExcalidrawElement, ExcalidrawScene } from '@secureyeoman/shared';

// ─── specToElement ──────────────────────────────────────────────────────────

describe('specToElement', () => {
  it('generates a valid element with id, seed, version', () => {
    const el = specToElement({ type: 'rectangle', x: 10, y: 20 }, 0);
    expect(el.id).toBeTruthy();
    expect(el.seed).toBeGreaterThan(0);
    expect(el.version).toBe(1);
    expect(el.versionNonce).toBeGreaterThan(0);
    expect(el.type).toBe('rectangle');
    expect(el.x).toBe(10);
    expect(el.y).toBe(20);
    expect(el.isDeleted).toBe(false);
    expect(el.locked).toBe(false);
  });

  it('uses provided id if given', () => {
    const el = specToElement({ id: 'my-id', type: 'ellipse', x: 0, y: 0 }, 0);
    expect(el.id).toBe('my-id');
  });

  it('applies default dimensions by type', () => {
    const rect = specToElement({ type: 'rectangle', x: 0, y: 0 }, 0);
    expect(rect.width).toBe(120);
    expect(rect.height).toBe(60);

    const diamond = specToElement({ type: 'diamond', x: 0, y: 0 }, 0);
    expect(diamond.width).toBe(100);
    expect(diamond.height).toBe(100);
  });

  it('uses provided dimensions over defaults', () => {
    const el = specToElement({ type: 'rectangle', x: 0, y: 0, width: 200, height: 100 }, 0);
    expect(el.width).toBe(200);
    expect(el.height).toBe(100);
  });

  it('creates text element with text-specific fields', () => {
    const el = specToElement({ type: 'text', x: 0, y: 0, label: 'Hello' }, 0);
    expect(el.text).toBe('Hello');
    expect(el.originalText).toBe('Hello');
    expect(el.fontSize).toBe(20);
    expect(el.fontFamily).toBe(1);
    expect(el.textAlign).toBe('center');
    expect(el.verticalAlign).toBe('middle');
    expect(el.autoResize).toBe(true);
  });

  it('creates arrow element with points and arrowhead', () => {
    const el = specToElement({ type: 'arrow', x: 0, y: 0 }, 0);
    expect(el.points).toEqual([[0, 0], [200, 0]]);
    expect(el.startBinding).toBeNull();
    expect(el.endBinding).toBeNull();
    expect(el.startArrowhead).toBeNull();
    expect(el.endArrowhead).toBe('arrow');
  });

  it('uses custom points for arrows', () => {
    const el = specToElement({
      type: 'arrow', x: 0, y: 0,
      points: [[0, 0], [100, 50], [200, 0]],
    }, 0);
    expect(el.points).toEqual([[0, 0], [100, 50], [200, 0]]);
  });

  it('assigns groupIds from groupId', () => {
    const el = specToElement({ type: 'rectangle', x: 0, y: 0, groupId: 'g1' }, 0);
    expect(el.groupIds).toEqual(['g1']);
  });

  it('sets containerId for text elements', () => {
    const el = specToElement({
      type: 'text', x: 0, y: 0, label: 'X', containerId: 'parent',
    }, 0);
    expect(el.containerId).toBe('parent');
  });
});

// ─── buildScene ─────────────────────────────────────────────────────────────

describe('buildScene', () => {
  it('creates valid scene structure', () => {
    const scene = buildScene('Test', [
      { type: 'rectangle', x: 0, y: 0 },
    ]);
    expect(scene.type).toBe('excalidraw');
    expect(scene.version).toBe(2);
    expect(scene.source).toBe('secureyeoman');
    expect(scene.appState.viewBackgroundColor).toBe('#ffffff');
    expect(scene.files).toEqual({});
    expect(scene.elements.length).toBeGreaterThanOrEqual(1);
  });

  it('handles bound text — creates text element for labeled shapes', () => {
    const scene = buildScene('Test', [
      { type: 'rectangle', x: 0, y: 0, label: 'Box' },
    ]);
    // Should have: rectangle + bound text
    expect(scene.elements.length).toBe(2);
    const rect = scene.elements.find((e) => e.type === 'rectangle')!;
    const text = scene.elements.find((e) => e.type === 'text')!;
    expect(rect.boundElements).toContainEqual({ type: 'text', id: text.id });
    expect(text.containerId).toBe(rect.id);
    expect(text.text).toBe('Box');
  });

  it('does not create bound text for text elements with labels', () => {
    const scene = buildScene('Test', [
      { type: 'text', x: 0, y: 0, label: 'Hello' },
    ]);
    expect(scene.elements.length).toBe(1);
    expect(scene.elements[0]!.type).toBe('text');
  });

  it('resolves arrow bindings between elements', () => {
    const scene = buildScene('Test', [
      { id: 'a', type: 'rectangle', x: 0, y: 0 },
      { id: 'b', type: 'rectangle', x: 300, y: 0 },
      { id: 'arrow1', type: 'arrow', x: 120, y: 30, startId: 'a', endId: 'b' },
    ]);
    const arrow = scene.elements.find((e) => e.type === 'arrow')!;
    const rectA = scene.elements.find((e) => e.id === arrow.startBinding?.elementId);
    const rectB = scene.elements.find((e) => e.id === arrow.endBinding?.elementId);
    expect(arrow.startBinding).toBeTruthy();
    expect(arrow.endBinding).toBeTruthy();
    expect(rectA).toBeTruthy();
    expect(rectB).toBeTruthy();
    expect(rectA!.boundElements).toContainEqual({ type: 'arrow', id: arrow.id });
    expect(rectB!.boundElements).toContainEqual({ type: 'arrow', id: arrow.id });
  });

  it('handles groups', () => {
    const scene = buildScene('Test', [
      { type: 'rectangle', x: 0, y: 0, groupId: 'g1' },
      { type: 'ellipse', x: 50, y: 50, groupId: 'g1' },
    ]);
    const rects = scene.elements.filter((e) => e.type !== 'text');
    for (const el of rects) {
      expect(el.groupIds).toContain('g1');
    }
  });

  it('applies theme and grid options', () => {
    const scene = buildScene('Test', [], {
      theme: 'dark',
      gridSize: 20,
      viewBackgroundColor: '#1a1a1a',
    });
    expect(scene.appState.theme).toBe('dark');
    expect(scene.appState.gridSize).toBe(20);
    expect(scene.appState.viewBackgroundColor).toBe('#1a1a1a');
  });
});

// ─── validateScene ──────────────────────────────────────────────────────────

describe('validateScene', () => {
  function makeScene(elements: ExcalidrawElement[]): ExcalidrawScene {
    return {
      type: 'excalidraw',
      version: 2,
      elements,
      appState: { viewBackgroundColor: '#ffffff', gridSize: null },
      files: {},
    };
  }

  function makeShape(overrides: Partial<ExcalidrawElement> = {}): ExcalidrawElement {
    return {
      id: `shape_${Math.random().toString(36).slice(2, 6)}`,
      type: 'rectangle',
      x: 0, y: 0, width: 100, height: 60,
      angle: 0, strokeColor: '#1e1e1e', backgroundColor: '#a5d8ff',
      fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid',
      roughness: 1, opacity: 100, groupIds: [], frameId: null,
      roundness: { type: 3 }, seed: 123, version: 1, versionNonce: 456,
      isDeleted: false, boundElements: null, updated: Date.now(),
      link: null, locked: false,
      ...overrides,
    };
  }

  it('detects overlapping elements', () => {
    const scene = makeScene([
      makeShape({ id: 'a', x: 0, y: 0, width: 100, height: 60 }),
      makeShape({ id: 'b', x: 50, y: 20, width: 100, height: 60 }),
    ]);
    const result = validateScene(scene);
    expect(result.issues.some((i) => i.type === 'overlap')).toBe(true);
  });

  it('does not flag overlapping elements in same group', () => {
    const scene = makeScene([
      makeShape({ id: 'a', x: 0, y: 0, groupIds: ['g1'] }),
      makeShape({ id: 'b', x: 50, y: 20, groupIds: ['g1'] }),
    ]);
    const result = validateScene(scene);
    expect(result.issues.filter((i) => i.type === 'overlap')).toHaveLength(0);
  });

  it('detects orphaned arrow bindings', () => {
    const arrow: ExcalidrawElement = {
      id: 'arrow1', type: 'arrow', x: 0, y: 0, width: 200, height: 0,
      angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
      fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid',
      roughness: 1, opacity: 100, groupIds: [], frameId: null,
      roundness: null, seed: 123, version: 1, versionNonce: 456,
      isDeleted: false, boundElements: null, updated: Date.now(),
      link: null, locked: false,
      points: [[0, 0], [200, 0]],
      startBinding: { elementId: 'nonexistent', focus: 0, gap: 8 },
      endBinding: null,
    };
    const scene = makeScene([arrow]);
    const result = validateScene(scene);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'orphaned-binding')).toBe(true);
  });

  it('detects text overflow', () => {
    const container = makeShape({
      id: 'container',
      width: 60,
      boundElements: [{ type: 'text', id: 'label' }],
    });
    const text: ExcalidrawElement = {
      id: 'label', type: 'text', x: 5, y: 15, width: 50, height: 25,
      angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
      fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid',
      roughness: 1, opacity: 100, groupIds: [], frameId: null,
      roundness: null, seed: 123, version: 1, versionNonce: 456,
      isDeleted: false, boundElements: null, updated: Date.now(),
      link: null, locked: false,
      text: 'This is a very long label text that should overflow',
      originalText: 'This is a very long label text that should overflow',
      fontSize: 20, fontFamily: 1, textAlign: 'center', verticalAlign: 'middle',
      containerId: 'container', autoResize: true, lineHeight: 1.25,
    };
    const scene = makeScene([container, text]);
    const result = validateScene(scene);
    expect(result.issues.some((i) => i.type === 'text-overflow')).toBe(true);
  });

  it('detects missing labels on shapes', () => {
    const scene = makeScene([
      makeShape({ id: 'unlabeled', boundElements: null }),
    ]);
    const result = validateScene(scene);
    expect(result.issues.some((i) => i.type === 'missing-label')).toBe(true);
  });

  it('detects low contrast', () => {
    // White text on white background → low contrast
    const container = makeShape({
      id: 'c1',
      backgroundColor: '#ffffff',
      boundElements: [{ type: 'text', id: 't1' }],
    });
    const text: ExcalidrawElement = {
      id: 't1', type: 'text', x: 5, y: 15, width: 80, height: 25,
      angle: 0, strokeColor: '#fefefe', backgroundColor: 'transparent',
      fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid',
      roughness: 1, opacity: 100, groupIds: [], frameId: null,
      roundness: null, seed: 123, version: 1, versionNonce: 456,
      isDeleted: false, boundElements: null, updated: Date.now(),
      link: null, locked: false,
      text: 'Hi', originalText: 'Hi', fontSize: 20, fontFamily: 1,
      textAlign: 'center', verticalAlign: 'middle',
      containerId: 'c1', autoResize: true, lineHeight: 1.25,
    };
    const scene = makeScene([container, text]);
    const result = validateScene(scene);
    expect(result.issues.some((i) => i.type === 'low-contrast')).toBe(true);
  });

  it('returns valid=true for a clean scene', () => {
    const shape = makeShape({
      id: 's1',
      boundElements: [{ type: 'text', id: 't1' }],
    });
    const text: ExcalidrawElement = {
      id: 't1', type: 'text', x: 5, y: 15, width: 80, height: 25,
      angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
      fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid',
      roughness: 1, opacity: 100, groupIds: [], frameId: null,
      roundness: null, seed: 123, version: 1, versionNonce: 456,
      isDeleted: false, boundElements: null, updated: Date.now(),
      link: null, locked: false,
      text: 'Box', originalText: 'Box', fontSize: 20, fontFamily: 1,
      textAlign: 'center', verticalAlign: 'middle',
      containerId: 's1', autoResize: true, lineHeight: 1.25,
    };
    const scene = makeScene([shape, text]);
    const result = validateScene(scene);
    expect(result.valid).toBe(true);
  });
});

// ─── patchScene ─────────────────────────────────────────────────────────────

describe('patchScene', () => {
  function makeTestScene(): ExcalidrawScene {
    return buildScene('Test', [
      { id: 'rect1', type: 'rectangle', x: 0, y: 0, label: 'Box A' },
      { id: 'rect2', type: 'rectangle', x: 200, y: 0, label: 'Box B' },
    ]);
  }

  it('adds a new element', () => {
    const scene = makeTestScene();
    const before = scene.elements.length;
    const result = patchScene(scene, [
      { op: 'add', element: { type: 'ellipse', x: 400, y: 0, label: 'New' } },
    ]);
    // Should add ellipse + its bound text
    expect(result.elements.length).toBe(before + 2);
    expect(result.elements.some((e) => e.type === 'ellipse')).toBe(true);
  });

  it('updates element properties', () => {
    const scene = makeTestScene();
    const rectId = scene.elements.find((e) => e.type === 'rectangle')!.id;
    const result = patchScene(scene, [
      { op: 'update', elementId: rectId, properties: { backgroundColor: '#ff0000' } },
    ]);
    const updated = result.elements.find((e) => e.id === rectId)!;
    expect(updated.backgroundColor).toBe('#ff0000');
    expect(updated.version).toBe(2);
  });

  it('deletes an element and its bound text', () => {
    const scene = makeTestScene();
    const rect = scene.elements.find((e) => e.type === 'rectangle')!;
    const textId = rect.boundElements?.find((b) => b.type === 'text')?.id;
    const result = patchScene(scene, [
      { op: 'delete', elementId: rect.id },
    ]);
    expect(result.elements.find((e) => e.id === rect.id)).toBeUndefined();
    if (textId) {
      expect(result.elements.find((e) => e.id === textId)).toBeUndefined();
    }
  });

  it('moves an element and its bound text', () => {
    const scene = makeTestScene();
    const rect = scene.elements.find((e) => e.type === 'rectangle')!;
    const textId = rect.boundElements?.find((b) => b.type === 'text')?.id;
    const textBefore = textId ? scene.elements.find((e) => e.id === textId)! : null;
    const result = patchScene(scene, [
      { op: 'move', elementId: rect.id, properties: { dx: 100, dy: 50 } },
    ]);
    const moved = result.elements.find((e) => e.id === rect.id)!;
    expect(moved.x).toBe(rect.x + 100);
    expect(moved.y).toBe(rect.y + 50);
    if (textId && textBefore) {
      const movedText = result.elements.find((e) => e.id === textId)!;
      expect(movedText.x).toBe(textBefore.x + 100);
      expect(movedText.y).toBe(textBefore.y + 50);
    }
  });

  it('restyles an element', () => {
    const scene = makeTestScene();
    const rectId = scene.elements.find((e) => e.type === 'rectangle')!.id;
    const result = patchScene(scene, [
      {
        op: 'restyle',
        elementId: rectId,
        properties: { strokeColor: '#ff0000', backgroundColor: '#00ff00', opacity: 50 },
      },
    ]);
    const restyled = result.elements.find((e) => e.id === rectId)!;
    expect(restyled.strokeColor).toBe('#ff0000');
    expect(restyled.backgroundColor).toBe('#00ff00');
    expect(restyled.opacity).toBe(50);
  });

  it('does not mutate the original scene', () => {
    const scene = makeTestScene();
    const originalElements = [...scene.elements];
    patchScene(scene, [
      { op: 'add', element: { type: 'diamond', x: 500, y: 0 } },
    ]);
    expect(scene.elements.length).toBe(originalElements.length);
  });

  it('cleans up arrow bindings when deleting target', () => {
    const scene = buildScene('Test', [
      { id: 'a', type: 'rectangle', x: 0, y: 0 },
      { id: 'b', type: 'rectangle', x: 300, y: 0 },
      { id: 'arr', type: 'arrow', x: 120, y: 30, startId: 'a', endId: 'b' },
    ]);
    const result = patchScene(scene, [{ op: 'delete', elementId: scene.elements.find((e) => e.type === 'rectangle')!.id }]);
    const arrow = result.elements.find((e) => e.type === 'arrow');
    // At least one binding should be nullified
    expect(
      arrow?.startBinding === null || arrow?.endBinding === null
    ).toBe(true);
  });
});
