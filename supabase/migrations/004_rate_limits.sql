CREATE TABLE IF NOT EXISTS rate_limits (
  ip   TEXT        PRIMARY KEY,
  count INTEGER    NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomically increments the counter for an IP within a sliding window.
-- Resets the counter when the window has expired.
-- Returns the new count so the caller can decide whether to reject.
CREATE OR REPLACE FUNCTION rate_limit_increment(p_ip TEXT, p_window_seconds INT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO rate_limits (ip, count, window_start)
  VALUES (p_ip, 1, now())
  ON CONFLICT (ip) DO UPDATE
  SET
    count = CASE
      WHEN rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        THEN 1
        ELSE rate_limits.count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        THEN now()
        ELSE rate_limits.window_start
    END
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;
