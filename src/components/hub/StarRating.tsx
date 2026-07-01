import './StarRating.css';

interface StarRatingProps {
  value: number | null;      // 0.5 .. 5.0, or null = 미지정
  onChange?: (value: number) => void;  // omit for read-only
  size?: number;             // px
}

// 5-star rating supporting half stars (0.5 steps). Click the left half of a star
// for x.5, the right half for x.0.
export default function StarRating({ value, onChange, size = 20 }: StarRatingProps) {
  const v = value ?? 0;
  const interactive = Boolean(onChange);
  return (
    <div
      className={`stars${interactive ? ' interactive' : ''}`}
      style={{ fontSize: `${size}px` }}
      role={interactive ? 'slider' : 'img'}
      aria-label={value == null ? '난이도 미지정' : `난이도 ${value} / 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span className="star" key={i}>
            <span className="star-bg">★</span>
            <span className="star-fg" style={{ width: `${fill * 100}%` }}>★</span>
            {interactive && (
              <>
                <button
                  type="button"
                  className="star-hit left"
                  aria-label={`${i + 0.5}점`}
                  onClick={() => onChange!(i + 0.5)}
                />
                <button
                  type="button"
                  className="star-hit right"
                  aria-label={`${i + 1}점`}
                  onClick={() => onChange!(i + 1)}
                />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
