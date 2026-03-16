import { CONFIG_ITEMS, NAV_ITEMS } from './constants';
import type { DialogStep } from './types';

interface SelectStepProps {
  setStep: (step: DialogStep) => void;
  navigateTo: (path: string) => void;
}

export function SelectStep({ setStep, navigateTo }: SelectStepProps) {
  return (
    <div className="space-y-5">
      {/* Create & Configure */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Create &amp; Configure
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONFIG_ITEMS.map((item, i) => {
            const { icon: Icon, label, desc } = item;
            const isNav = item.kind === 'nav';

            return (
              <button
                key={i}
                onClick={() => {
                  if (item.kind === 'form') {
                    setStep(item.step);
                  } else {
                    navigateTo(item.path);
                  }
                }}
                className={`p-3 rounded-lg hover:bg-muted/50 transition-colors text-left border ${
                  isNav ? 'border-dashed' : ''
                }`}
              >
                <Icon
                  className={`w-5 h-5 mb-1.5 ${isNav ? 'text-muted-foreground' : 'text-primary'}`}
                />
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigate & Create */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Navigate &amp; Create
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {NAV_ITEMS.map(({ path, icon: Icon, label, desc }) => (
            <button
              key={path + label}
              onClick={() => {
                navigateTo(path);
              }}
              className="p-3 border border-dashed rounded-lg hover:bg-muted/50 transition-colors text-left"
            >
              <Icon className="w-5 h-5 mb-1.5 text-muted-foreground" />
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
