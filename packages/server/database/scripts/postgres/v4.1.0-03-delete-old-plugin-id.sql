UPDATE clients
SET
    extras = extras - 'plugin-workflow-client'
WHERE extras ? 'plugin-workflow-client';
