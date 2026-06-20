interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}

export default function UrlInput({ value, onChange, optional }: UrlInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Target Application URL
        {optional ? (
          <span className="text-gray-400 font-normal"> (optional if JSON has navigate steps)</span>
        ) : (
          <span className="text-red-500"> *</span>
        )}
      </label>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://your-app.com"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </div>
  );
}
