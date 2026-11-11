import { sql } from "drizzle-orm";
import { tasks, activityLogs } from "./schema";

// Independent flags preserve unassigned legacy tasks and project history too.
export const visibleTasks = sql`${tasks.archived} = 0 AND NOT EXISTS (
  SELECT 1 FROM agents archived_agent
  WHERE archived_agent.id = ${tasks.assignedTo} AND archived_agent.archived = 1
) AND NOT EXISTS (
  SELECT 1 FROM projects archived_project
  WHERE archived_project.id = ${tasks.projectId} AND archived_project.archived = 1
)`;

export const visibleActivity = sql`${activityLogs.archived} = 0 AND NOT EXISTS (
  SELECT 1 FROM agents archived_agent
  WHERE archived_agent.archived = 1 AND
    ${activityLogs.entityType} = 'agent' AND archived_agent.id = ${activityLogs.entityId}
) AND NOT EXISTS (
  SELECT 1 FROM projects archived_project
  WHERE archived_project.archived = 1 AND
    ${activityLogs.entityType} = 'project' AND archived_project.id = ${activityLogs.entityId}
) AND NOT EXISTS (
  SELECT 1 FROM tasks archived_task
  WHERE ${activityLogs.entityType} = 'task' AND archived_task.id = ${activityLogs.entityId}
    AND (archived_task.archived = 1 OR EXISTS (
      SELECT 1 FROM agents a WHERE a.id = archived_task.assigned_to AND a.archived = 1
    ) OR EXISTS (
      SELECT 1 FROM projects p WHERE p.id = archived_task.project_id AND p.archived = 1
    ))
)`;
