import { AgentWorldWidget } from '../../AgentWorldWidget';

export function AgentWorldNode() {
  return (
    <div className="h-full overflow-auto">
      <AgentWorldWidget zoom={0.8} />
    </div>
  );
}
