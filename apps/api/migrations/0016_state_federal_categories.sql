-- The state's own federal categories per entry (Indiana's "Federal category" column; project
-- lead, 2026-11-13). Law categories in federal order joined by ",", NULL when the state names
-- none. Nullable with no default, so ADD COLUMN works and old rows keep their current rule.
-- The column CHECK is added by hand (Drizzle cannot express a column-level check, and a table
-- check would make it rebuild `entries`): with each known value removed once, only the outer
-- commas may remain, so the text holds only the five law categories, each at most once, with
-- no empty parts.
ALTER TABLE `entries` ADD `state_federal_categories` text
  CONSTRAINT `entries_state_federal_categories_check` CHECK (
    `state_federal_categories` IS NULL OR replace(replace(replace(replace(replace(
      ',' || `state_federal_categories` || ',',
      ',blind_or_disabled,', ','),
      ',sud,', ','),
      ',disabling_mental_disorder,', ','),
      ',physical_idd_adl,', ','),
      ',serious_complex_medical,', ',') = ','
  );
