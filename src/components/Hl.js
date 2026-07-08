export default function Hl({ text, indices }) {
  if (!indices?.length) return <>{text}</>;
  const set = new Set(indices);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i)
          ? <span key={i} className="text-indigo-300 font-semibold">{ch}</span>
          : ch
      )}
    </>
  );
}
