CREATE TABLE `state_similarity` (
	`state_a` text NOT NULL,
	`state_b` text NOT NULL,
	`shared` integer NOT NULL,
	`only_a` integer NOT NULL,
	`only_b` integer NOT NULL,
	`jaccard` real NOT NULL,
	`computed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`state_a`, `state_b`),
	FOREIGN KEY (`state_a`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`state_b`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "state_similarity_order_check" CHECK("state_similarity"."state_a" < "state_similarity"."state_b"),
	CONSTRAINT "state_similarity_counts_check" CHECK("state_similarity"."shared" >= 0 AND "state_similarity"."only_a" >= 0 AND "state_similarity"."only_b" >= 0 AND "state_similarity"."jaccard" >= 0 AND "state_similarity"."jaccard" <= 1)
) WITHOUT ROWID;
-- WITHOUT ROWID added by hand (drizzle-kit cannot express it): one D1 write per row, no other
-- index. See the comment on stateSimilarity in src/db/schema.ts.
--> statement-breakpoint
-- Every pair of states with a list, from the lists already published: the statement
-- similarityUpsert('all') in src/db/similarity.ts builds (src/db/similarity.test.ts checks that
-- they agree). Later publishes and rollbacks recompute their state's pairs.
WITH
  pub AS (SELECT id AS state_id, published_version_id AS vid FROM states
          WHERE published_version_id IS NOT NULL),
  icd AS MATERIALIZED (
    SELECT p.state_id, e.code_norm, e.match_kind, e.range_end_norm,
      coalesce(e.includes_children, 0) AS kids
    FROM pub p JOIN entries e ON e.version_id = p.vid WHERE e.code_system = 'icd10cm'),
  hits AS (
    SELECT i.state_id, r.code_norm AS code FROM icd i CROSS JOIN ref_codes r
    WHERE i.match_kind = 'exact' AND i.kids <> 1
      AND r.code_system = 'icd10cm' AND r.code_norm = i.code_norm
      AND r.billable = 1 AND r.valid_to IS NULL
    UNION ALL
    SELECT i.state_id, r.code_norm FROM icd i CROSS JOIN ref_codes r
    WHERE (i.match_kind = 'prefix' OR (i.match_kind = 'exact' AND i.kids = 1))
      AND r.code_system = 'icd10cm' AND r.code_norm >= i.code_norm AND r.code_norm < i.code_norm || '~'
      AND r.billable = 1 AND r.valid_to IS NULL
    UNION ALL
    SELECT i.state_id, r.code_norm FROM icd i CROSS JOIN ref_codes r
    WHERE i.match_kind = 'range' AND i.kids = 1
      AND r.code_system = 'icd10cm' AND r.code_norm >= i.code_norm
      AND r.code_norm < i.range_end_norm || '~'
      AND substr(r.code_norm, 1, length(i.code_norm)) >= i.code_norm
      AND substr(r.code_norm, 1, length(i.range_end_norm)) <= i.range_end_norm
      AND r.billable = 1 AND r.valid_to IS NULL
    UNION ALL
    SELECT i.state_id, r.code_norm FROM icd i CROSS JOIN ref_codes r
    WHERE i.match_kind = 'range' AND i.kids <> 1
      AND r.code_system = 'icd10cm' AND r.code_norm >= i.code_norm AND r.code_norm <= i.range_end_norm
      AND length(r.code_norm) = length(i.code_norm)
      AND r.billable = 1 AND r.valid_to IS NULL),
  others AS (
    SELECT p.state_id, e.code_system || '|' || CASE
        WHEN e.match_kind = 'range'
          THEN 'range|' || e.code_norm || '|' || e.range_end_norm || '|'
               || CASE WHEN e.includes_children = 1 THEN '*' ELSE '' END
        WHEN e.match_kind = 'prefix' OR e.includes_children = 1 THEN 'prefix|' || e.code_norm
        ELSE 'exact|' || e.code_norm END AS code
    FROM pub p JOIN entries e ON e.version_id = p.vid WHERE e.code_system <> 'icd10cm'),
  sets AS MATERIALIZED (SELECT state_id, code FROM hits UNION SELECT state_id, code FROM others),
  sizes AS MATERIALIZED (SELECT state_id, count(*) AS n FROM sets GROUP BY state_id),
  common AS (
    SELECT x.state_id AS x, o.state_id AS o, count(*) AS n
    FROM sets x CROSS JOIN sets o
    WHERE o.code = x.code AND o.state_id > x.state_id
    GROUP BY x.state_id, o.state_id),
  pairs AS (
    SELECT x.state_id AS x, o.state_id AS o, x.n AS n_x, o.n AS n_o, coalesce(c.n, 0) AS shared
    FROM sizes x CROSS JOIN sizes o
    LEFT JOIN common c ON c.x = x.state_id AND c.o = o.state_id
    WHERE o.state_id > x.state_id)
  INSERT INTO state_similarity (state_a, state_b, shared, only_a, only_b, jaccard, computed_at)
  SELECT min(x, o), max(x, o), shared,
    CASE WHEN x < o THEN n_x ELSE n_o END - shared,
    CASE WHEN x < o THEN n_o ELSE n_x END - shared,
    CASE WHEN n_x + n_o - shared = 0 THEN 0.0 ELSE CAST(shared AS REAL) / (n_x + n_o - shared) END,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM pairs WHERE true
  ON CONFLICT (state_a, state_b) DO UPDATE SET
    shared = excluded.shared, only_a = excluded.only_a, only_b = excluded.only_b,
    jaccard = excluded.jaccard, computed_at = excluded.computed_at
  WHERE shared <> excluded.shared OR only_a <> excluded.only_a OR only_b <> excluded.only_b
;
