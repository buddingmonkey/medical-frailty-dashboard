-- Hand-written data migration (M6 step 3b, plain-language pass, project lead 2026-11-03):
-- rewords the starter unified categories of migration 0011 for public readers ("CCSR:" spelled
-- out, no "Tier 2" or "mapped by CCSR" jargon, the SMI definition says it is this site's
-- grouping, the kidney label drops "dialysis", the transplant definition describes codes, not
-- people). Each field changes ONLY while it still holds 0011's exact text, so a label or
-- definition an admin has edited (on production, say) is kept. A changed row gets version + 1,
-- like an edit in Admin -> Unified categories. The wording is on the legal review list.
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: blindness and vision defects.' THEN 'Diagnosis groups (CCSR): blindness and vision defects.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'blindness-low-vision' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: blindness and vision defects.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: opioid-related disorders, initial and subsequent encounters.' THEN 'Diagnosis groups (CCSR): opioid-related disorders, initial and subsequent encounters.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'opioid-use-disorder' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: opioid-related disorders, initial and subsequent encounters.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: alcohol-related disorders.' THEN 'Diagnosis groups (CCSR): alcohol-related disorders.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'alcohol-use-disorder' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: alcohol-related disorders.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: cannabis, sedative, stimulant, hallucinogen, inhalant and other specified substance-related disorders.' THEN 'Diagnosis groups (CCSR): cannabis, sedative, stimulant, hallucinogen, inhalant and other specified substance-related disorders.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'other-substance-use' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: cannabis, sedative, stimulant, hallucinogen, inhalant and other specified substance-related disorders.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `definition` = CASE WHEN `definition` = 'Psychotic, bipolar and depressive disorders.' THEN 'What this site groups as serious mental illness: psychotic, bipolar and depressive disorders. States define serious mental illness in different ways; this grouping of diagnoses is not any state’s definition.' ELSE `definition` END,
  `includes` = CASE WHEN `includes` = 'CCSR: schizophrenia spectrum and other psychotic disorders; bipolar and related disorders; depressive disorders; other mood disorders.' THEN 'Diagnosis groups (CCSR): schizophrenia spectrum and other psychotic disorders; bipolar and related disorders; depressive disorders; other mood disorders.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'serious-mental-illness' AND `created_by` = 'migration 0011' AND (`definition` = 'Psychotic, bipolar and depressive disorders.' OR `includes` = 'CCSR: schizophrenia spectrum and other psychotic disorders; bipolar and related disorders; depressive disorders; other mood disorders.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: anxiety and fear-related; obsessive-compulsive and related; trauma- and stressor-related disorders.' THEN 'Diagnosis groups (CCSR): anxiety and fear-related; obsessive-compulsive and related; trauma- and stressor-related disorders.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'anxiety-trauma' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: anxiety and fear-related; obsessive-compulsive and related; trauma- and stressor-related disorders.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: neurocognitive disorders.' THEN 'Diagnosis groups (CCSR): neurocognitive disorders.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'dementia' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: neurocognitive disorders.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: personality disorders; feeding and eating disorders.' THEN 'Diagnosis groups (CCSR): personality disorders; feeding and eating disorders.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'personality-eating' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: personality disorders; feeding and eating disorders.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: neurodevelopmental disorders; chromosomal abnormalities.' THEN 'Diagnosis groups (CCSR): neurodevelopmental disorders; chromosomal abnormalities.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'intellectual-developmental' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: neurodevelopmental disorders; chromosomal abnormalities.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: cerebral palsy; paralysis (other than cerebral palsy).' THEN 'Diagnosis groups (CCSR): cerebral palsy; paralysis (other than cerebral palsy).' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'paralysis-cerebral-palsy' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: cerebral palsy; paralysis (other than cerebral palsy).');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: Parkinson''s disease; multiple sclerosis; other nervous system disorders (often hereditary or degenerative).' THEN 'Diagnosis groups (CCSR): Parkinson''s disease; multiple sclerosis; other nervous system disorders (often hereditary or degenerative).' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'degenerative-neurological' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: Parkinson''s disease; multiple sclerosis; other nervous system disorders (often hereditary or degenerative).');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: all malignant neoplasm groups, conditions due to neoplasms, and leukemia, lymphoma and myeloma in remission.' THEN 'Diagnosis groups (CCSR): all malignant neoplasm groups, conditions due to neoplasms, and leukemia, lymphoma and myeloma in remission.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'cancer' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: all malignant neoplasm groups, conditions due to neoplasms, and leukemia, lymphoma and myeloma in remission.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `label` = CASE WHEN `label` = 'Kidney failure and dialysis' THEN 'Chronic kidney disease and kidney failure' ELSE `label` END,
  `includes` = CASE WHEN `includes` = 'CCSR: chronic kidney disease.' THEN 'Diagnosis groups (CCSR): chronic kidney disease.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'kidney-failure' AND `created_by` = 'migration 0011' AND (`label` = 'Kidney failure and dialysis' OR `includes` = 'CCSR: chronic kidney disease.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: HIV infection.' THEN 'Diagnosis groups (CCSR): HIV infection.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'hiv' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: HIV infection.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `definition` = CASE WHEN `definition` = 'People with a transplanted organ.' THEN 'Codes that record that a person has a transplanted organ.' ELSE `definition` END,
  `includes` = CASE WHEN `includes` = 'CCSR: organ transplant status.' THEN 'Diagnosis groups (CCSR): organ transplant status.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'organ-transplant' AND `created_by` = 'migration 0011' AND (`definition` = 'People with a transplanted organ.' OR `includes` = 'CCSR: organ transplant status.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: heart failure; chronic obstructive pulmonary disease and bronchiectasis; respiratory failure; cystic fibrosis.' THEN 'Diagnosis groups (CCSR): heart failure; chronic obstructive pulmonary disease and bronchiectasis; respiratory failure; cystic fibrosis.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'heart-lung' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: heart failure; chronic obstructive pulmonary disease and bronchiectasis; respiratory failure; cystic fibrosis.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: diabetes mellitus with complication.' THEN 'Diagnosis groups (CCSR): diabetes mellitus with complication.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'diabetes-complications' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: diabetes mellitus with complication.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `includes` = CASE WHEN `includes` = 'CCSR: epilepsy; convulsions.' THEN 'Diagnosis groups (CCSR): epilepsy; convulsions.' ELSE `includes` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'epilepsy' AND `created_by` = 'migration 0011' AND (`includes` = 'CCSR: epilepsy; convulsions.');
--> statement-breakpoint
UPDATE `unified_categories` SET
  `definition` = CASE WHEN `definition` = 'State categories of frailty indicators that fit no clinical group, such as a state''s Tier 2 list. Mapped by state category, not by CCSR.' THEN 'Codes a state files under its own frailty-indicator category rather than a diagnosis group (for example, a state’s second-tier list). This site puts codes here only through a mapping of the state’s own category, never automatically by diagnosis group.' ELSE `definition` END,
  `version` = `version` + 1,
  `updated_by` = 'migration 0013',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `slug` = 'frailty-indicators' AND `created_by` = 'migration 0011' AND (`definition` = 'State categories of frailty indicators that fit no clinical group, such as a state''s Tier 2 list. Mapped by state category, not by CCSR.');
--> statement-breakpoint
INSERT INTO `app_meta` (`key`, `value`) VALUES ('data_version', '1')
  ON CONFLICT (`key`) DO UPDATE SET `value` = CAST(CAST(`value` AS INTEGER) + 1 AS TEXT);
