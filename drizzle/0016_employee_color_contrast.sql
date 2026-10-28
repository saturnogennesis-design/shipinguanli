UPDATE users SET content_color=CASE content_color
 WHEN '#edf1fa' THEN '#b8cafa' WHEN '#f0edfa' THEN '#cab7ef'
 WHEN '#eaf2f8' THEN '#afd4ed' WHEN '#f2eef6' THEN '#d5bddf'
 WHEN '#eceff5' THEN '#b7c0d2' WHEN '#eaf3f5' THEN '#afd2d9'
 WHEN '#f0f0fa' THEN '#c1bfe7' WHEN '#edf0f7' THEN '#c5ccdc'
 ELSE content_color END;
