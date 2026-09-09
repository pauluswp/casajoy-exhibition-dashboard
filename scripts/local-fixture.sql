-- Synthetic QA data only. Never replace this with a production export.
INSERT OR REPLACE INTO contacts (
  id, source_name, company, person, email, phone, exhibition, day,
  relationship, category, followup, priority, notes, review_note, status,
  good_enough, form_image_key, card_image_key, qr_data
) VALUES (
  'qa-synthetic-001', 'Synthetic QA fixture', 'Example Foods Pty Ltd',
  'Synthetic Visitor', 'qa-synthetic@example.test', '+61 400 000 000',
  'Local QA Exhibition', 'Day 1', 'Prospect', 'QA', 'No action', 'Low',
  'Synthetic record for local checks only.', '', 'needs_review', 0, '', '', '[]'
);

DELETE FROM edit_history WHERE contact_id = 'qa-synthetic-001';
INSERT INTO edit_history (contact_id, editor, action, before_json, after_json)
VALUES (
  'qa-synthetic-001', 'local-qa', 'create', '{}',
  '{"id":"qa-synthetic-001","company":"Example Foods Pty Ltd"}'
);
