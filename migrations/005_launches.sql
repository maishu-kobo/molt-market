-- Launches table for Product Hunt-style daily launches
CREATE TABLE IF NOT EXISTS launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  launched_at DATE NOT NULL DEFAULT CURRENT_DATE,
  tagline TEXT,
  upvote_count INT DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id)  -- Each listing can only be launched once
);

-- Upvotes table (who upvoted what launch)
CREATE TABLE IF NOT EXISTS launch_upvotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(launch_id, user_id)  -- One upvote per user per launch
);

-- Index for daily launches query
CREATE INDEX IF NOT EXISTS idx_launches_date ON launches(launched_at DESC);
CREATE INDEX IF NOT EXISTS idx_launches_featured ON launches(is_featured) WHERE is_featured = true;
