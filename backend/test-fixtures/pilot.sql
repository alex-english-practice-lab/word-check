-- One-time private-pilot fixtures. The deployment command that invokes this
-- file is removed immediately after the remote seed succeeds.
INSERT OR IGNORE INTO students(id,display_name,status,created_at,updated_at) VALUES
 ('11111111-1111-4111-8111-111111111111','Test Student A','active','2026-11-03T01:15:00.000Z','2026-11-03T01:15:00.000Z'),
 ('22222222-2222-4222-8222-222222222222','Test Student B','active','2026-11-03T01:15:00.000Z','2026-11-03T01:15:00.000Z');

INSERT OR IGNORE INTO student_aliases(normalized_alias,student_id,active,created_at) VALUES
 ('pilot-a','11111111-1111-4111-8111-111111111111',1,'2026-11-03T01:15:00.000Z'),
 ('pilot-b','22222222-2222-4222-8222-222222222222',1,'2026-11-03T01:15:00.000Z');

INSERT OR IGNORE INTO assignments(id,token_hash,student_id,preset_hash,created_at,expires_at) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','4ba3ec4112961be2d80e60083ae9190a6a4f52e09327dfdd20617cc06ad91447','11111111-1111-4111-8111-111111111111','#preset=eyJ2IjozLCJsIjoibGliOmllbHRzIiwieCI6IjEuMC4wIiwibSI6MCwicSI6IjAuMS4xIiwidCI6MCwiaCI6MX0.C29Uo_Ga0ATDSA_3LhM6lbY5GTVdvdp5tFU1u6C-Aog','2026-11-03T01:15:00.000Z','2026-12-03T01:15:00.000Z');
