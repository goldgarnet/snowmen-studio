// A yellow folder icon used as a folder card's "thumbnail" (in place of a map preview).
export default function FolderGlyph() {
  return (
    <div className="folder-glyph">
      <svg viewBox="0 0 64 48" width="46%" role="img" aria-label="폴더">
        {/* back panel + tab */}
        <path d="M6 11c0-1.7 1.3-3 3-3h13.2c.9 0 1.7.4 2.3 1.1L28 12h27c1.7 0 3 1.3 3 3v25c0 1.7-1.3 3-3 3H9c-1.7 0-3-1.3-3-3V11z"
          fill="#e3a92b" />
        {/* front flap */}
        <path d="M6 20h52v20c0 1.7-1.3 3-3 3H9c-1.7 0-3-1.3-3-3V20z" fill="#f7c840" />
      </svg>
    </div>
  );
}
