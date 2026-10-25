/* ==========================================================================
   TaskFlow — Task Manager
   Validation and create/edit/delete logic for tasks. Works on plain task
   arrays and form-data objects passed in — no DOM access here. app.js
   (or ui.js) is responsible for reading form fields and calling these.
   ========================================================================== */

const TaskManager = (function () {

  // Returns an error string if the title/assignee are invalid, or null if ok.
  function validate(tasks, title, assignee, excludeId) {
    const cleanTitle = title.trim();
    const cleanAssignee = assignee.trim();

    if (cleanTitle.length < 3) return 'Task title must be at least 3 characters.';
    if (cleanTitle.length > 100) return 'Task title must be under 100 characters.';
    if (!cleanAssignee) return 'Please provide an assignee.';

    const isDuplicate = tasks.some(t =>
      t.id !== excludeId && t.title.trim().toLowerCase() === cleanTitle.toLowerCase()
    );
    if (isDuplicate) return 'A task with this title already exists.';

    return null;
  }

  // formData shape: { title, description, assignee, priority, dueDate, status, dependencies }
  function buildNewTask(formData) {
    return {
      id: 'task-' + Date.now(),
      title: formData.title.trim(),
      description: formData.description.trim(),
      assignee: formData.assignee.trim(),
      priority: formData.priority,
      dueDate: formData.dueDate,
      status: formData.status,
      dependencies: formData.dependencies
    };
  }

  // Mutates `task` in place with the new form values, and returns it.
  function applyEdits(task, formData) {
    task.title = formData.title.trim();
    task.description = formData.description.trim();
    task.assignee = formData.assignee.trim();
    task.priority = formData.priority;
    task.dueDate = formData.dueDate;
    task.status = formData.status;
    task.dependencies = formData.dependencies;
    return task;
  }

  // Tasks that list `taskId` as a dependency — used to block deleting
  // a task that something else still relies on.
  function getDependents(tasks, taskId) {
    return tasks.filter(t => t.dependencies && t.dependencies.includes(taskId));
  }

  return { validate, buildNewTask, applyEdits, getDependents };
})();
