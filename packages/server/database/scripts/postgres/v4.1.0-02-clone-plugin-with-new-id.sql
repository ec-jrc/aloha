UPDATE clients
SET
    extras
    = extras
    || jsonb_build_object('plugin-workflow', extras -> 'plugin-workflow-client')
WHERE extras ? 'plugin-workflow-client';
