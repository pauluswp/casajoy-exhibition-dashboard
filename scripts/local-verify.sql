SELECT COUNT(*) AS synthetic_contacts
FROM contacts
WHERE id = 'qa-synthetic-001';

SELECT COUNT(*) AS synthetic_history
FROM edit_history
WHERE contact_id = 'qa-synthetic-001';
