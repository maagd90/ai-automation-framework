import { useCallback, useState } from 'react';
import { UploadCloudIcon, FileTextIcon, XIcon } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  accept?: string;
}

export default function FileUpload({ onFileSelect, accept = '.txt,.json,.feature' }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFile = useCallback(
    (f: File) => {
      setFile(f);
      onFileSelect(f);
    },
    [onFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const clear = () => {
    setFile(null);
    onFileSelect(null);
  };

  return (
    <div>
      {file ? (
        <div className="flex items-center gap-3 border border-brand-500 rounded-lg px-4 py-3 bg-brand-50">
          <FileTextIcon className="w-5 h-5 text-brand-600 shrink-0" />
          <span className="text-sm font-medium text-brand-700 truncate">{file.name}</span>
          <button
            onClick={clear}
            className="ml-auto text-gray-400 hover:text-red-500 transition-colors"
            aria-label="Remove file"
            type="button"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`cursor-pointer flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-6 py-8 transition-colors ${
            dragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50'
          }`}
        >
          <UploadCloudIcon className={`w-8 h-8 ${dragging ? 'text-brand-500' : 'text-gray-400'}`} />
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-brand-600">Click to upload</span> or drag & drop
          </p>
          <p className="text-xs text-gray-400">Supports: .txt, .json, .feature (max 5 MB)</p>
          <input
            type="file"
            accept={accept}
            onChange={handleChange}
            className="sr-only"
          />
        </label>
      )}
    </div>
  );
}
