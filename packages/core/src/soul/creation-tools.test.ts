import { describe, it, expect } from 'vitest';
import { getCreationTools } from './creation-tools.js';

const ALL_OFF = {
  skills: false,
  tasks: false,
  personalities: false,
  subAgents: false,
  customRoles: false,
  roleAssignments: false,
  experiments: false,
  allowA2A: false,
  allowSwarms: false,
  allowDynamicTools: false,
};

describe('getCreationTools', () => {
  describe('guard conditions', () => {
    it('returns [] when bodyEnabled is false regardless of toggles', () => {
      expect(getCreationTools({ ...ALL_OFF, skills: true, tasks: true }, false)).toEqual([]);
    });

    it('returns [] when config is undefined', () => {
      expect(getCreationTools(undefined, true)).toEqual([]);
    });

    it('returns [] when all toggles are false', () => {
      expect(getCreationTools(ALL_OFF, true)).toEqual([]);
    });
  });

  describe('skills toggle', () => {
    it('injects create_skill, update_skill, delete_skill when skills is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, skills: true }, true);
      const names = tools.map((t) => t.name);
      expect(names).toContain('create_skill');
      expect(names).toContain('update_skill');
      expect(names).toContain('delete_skill');
    });

    it('does not inject skill tools when skills is false', () => {
      const tools = getCreationTools(ALL_OFF, true);
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('create_skill');
    });
  });

  describe('tasks toggle', () => {
    it('injects create_task and update_task when tasks is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, tasks: true }, true);
      const names = tools.map((t) => t.name);
      expect(names).toContain('create_task');
      expect(names).toContain('update_task');
    });

    it('does not inject task tools when tasks is false', () => {
      const tools = getCreationTools(ALL_OFF, true);
      expect(tools.map((t) => t.name)).not.toContain('create_task');
    });
  });

  describe('personalities toggle', () => {
    it('injects create_personality and update_personality when personalities is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, personalities: true }, true);
      const names = tools.map((t) => t.name);
      expect(names).toContain('create_personality');
      expect(names).toContain('update_personality');
    });
  });

  describe('subAgents toggle', () => {
    it('injects delegate_task, list_sub_agents, get_delegation_result when subAgents is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, subAgents: true }, true);
      const names = tools.map((t) => t.name);
      expect(names).toContain('delegate_task');
      expect(names).toContain('list_sub_agents');
      expect(names).toContain('get_delegation_result');
    });
  });

  describe('customRoles toggle', () => {
    it('injects create_custom_role when customRoles is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, customRoles: true }, true);
      expect(tools.map((t) => t.name)).toContain('create_custom_role');
    });
  });

  describe('roleAssignments toggle', () => {
    it('injects assign_role when roleAssignments is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, roleAssignments: true }, true);
      expect(tools.map((t) => t.name)).toContain('assign_role');
    });
  });

  describe('experiments toggle', () => {
    it('injects create_experiment when experiments is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, experiments: true }, true);
      expect(tools.map((t) => t.name)).toContain('create_experiment');
    });
  });

  describe('allowA2A toggle', () => {
    it('injects a2a_connect and a2a_send when allowA2A is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, allowA2A: true }, true);
      const names = tools.map((t) => t.name);
      expect(names).toContain('a2a_connect');
      expect(names).toContain('a2a_send');
    });
  });

  describe('allowSwarms toggle', () => {
    it('injects create_swarm when allowSwarms is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, allowSwarms: true }, true);
      expect(tools.map((t) => t.name)).toContain('create_swarm');
    });

    it('does not duplicate create_swarm when both subAgents and allowSwarms are true', () => {
      const tools = getCreationTools({ ...ALL_OFF, subAgents: true, allowSwarms: true }, true);
      const swarmTools = tools.filter((t) => t.name === 'create_swarm');
      expect(swarmTools).toHaveLength(1);
    });
  });

  describe('allowDynamicTools toggle', () => {
    it('injects register_dynamic_tool when allowDynamicTools is true', () => {
      const tools = getCreationTools({ ...ALL_OFF, allowDynamicTools: true }, true);
      expect(tools.map((t) => t.name)).toContain('register_dynamic_tool');
    });
  });

  describe('combined toggles', () => {
    it('returns tools for all enabled toggles together', () => {
      const tools = getCreationTools(
        { ...ALL_OFF, skills: true, tasks: true, experiments: true },
        true
      );
      const names = tools.map((t) => t.name);
      expect(names).toContain('create_skill');
      expect(names).toContain('create_task');
      expect(names).toContain('create_experiment');
      expect(names).not.toContain('create_personality');
      expect(names).not.toContain('delegate_task');
    });

    it('handles a partial config (missing keys default to falsy)', () => {
      const tools = getCreationTools({ skills: true }, true);
      const names = tools.map((t) => t.name);
      expect(names).toContain('create_skill');
      expect(names).not.toContain('create_task');
    });
  });
});
