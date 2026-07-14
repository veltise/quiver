export default function ModalShell({ onClose, maxWidth = 'max-w-sm', children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-20 pt-24" onClick={onClose}>
      <div className={`bg-gray-900 border border-gray-700 rounded-xl w-full ${maxWidth} p-6 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
