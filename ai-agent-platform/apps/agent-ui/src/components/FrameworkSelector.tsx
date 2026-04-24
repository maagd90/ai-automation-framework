interface FrameworkSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const FRAMEWORKS = [{ value: 'playwright-typescript', label: 'Playwright TypeScript' }];

export default function FrameworkSelector({ value, onChange }: FrameworkSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Framework
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {FRAMEWORKS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}
