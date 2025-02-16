"use strict"; // strict mode

// Init context

const context = {
  "processField": null,
  "statusField": null,
  "errField": null,
  "actionsTable": "Actions",
  "modulesTable": "Modules",
  "container": document.getElementById("container"),
  "modules": null,
  "actions": null,
};


let lock = false;

// Utilities

function throwErr(msg) {
  alert(`ERROR: ${msg}`);
  throw new Error(msg);
}

function hasKeys(keys, reqKeys) {
  return reqKeys.every(k => keys.includes(k));
}

// Wrapper functions (for convenience)

async function addRecordWrap({tableId, fields={}, confirmText=null, setCursor=true}) {
  if (confirmText && !confirm(confirmText)) { return; }
  try {
    const res = await grist.getTable(tableId).create({fields: fields});
    if (setCursor) { grist.setCursorPos({rowId: res.id}); }
    return res.id;
  } catch (err) { throwErr(`Cannot add record in <${tableId}> table: ${err}`); }
}

async function delRecordsWrap({tableId, ids, confirmText=null}) { 
  if (confirmText && !confirm(confirmText)) { return; }
  try { grist.selectedTable.destroy(ids); }
  catch (err) { throwErr(`Cannot delete records in <${tableId}> table: ${err}`); }
};
  
async function updateRecordsWrap({tableId, ids, fields={}, confirmText=null}) {
    if (confirmText && !confirm(confirmText)) {return;}
    // from {"prop1": "val1", "prop2": "val2"} obtain:
    // {"prop1": ["val1", "val1"], "prop2": ["val1", "val1"], ...}
    const fss = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, Array(ids.length).fill(value)])
    );
    const actions = [["BulkUpdateRecord", tableId, ids, fss]];
  try {
    await grist.docApi.applyUserActions(actions);
  } catch (err) { throwErr(`Cannot update records in <${tableId}> table: ${err}`); }
}

async function duplicateRecordWrap({tableId, record, keys, confirmText=null, setCursor=true}) {
  if (confirmText && !confirm(confirmText)) {return;}
  // filter new keys, eg. not formulas
  const fields = Object.fromEntries(  
    Object.entries(record).filter(([key]) => keys.includes(key))
  );
  try {
      return await addRecordWrap({tableId: tableId, fields: fields, setCursor: setCursor});
  } catch (err) {alert(`Cannot duplicate record in <${tableId}> table: ${err}`);}
}

// Premade isActive functions

async function isValid(context, action, record) {
  return (!record[context.errField]);  // no errors, validation ok  
}

// Premade onclick functions

async function addRecord(context, action, record) {
  const res = await grist.selectedTable.create({fields: {},});
  grist.setCursorPos({rowId: res.id});
}

async function delRecord(context, action, record) {
   if (!confirm("Delete record?")) { return; }
  grist.selectedTable.destroy([record.id]);
}

async function updateStatus(context, action, record) {
  await grist.selectedTable.update({
    id: record.id,
    fields: {[context.statusField] : action.end_status},
  });
}

// Load modules dict

async function loadModules(context) {
  const modules = {};
  // Get modules table
  const data = await grist.docApi.fetchTable(context.modulesTable);
  const keys = Object.keys(data);
  // Check required keys
  const reqKeys = ["name", "js", "active"];
  if (!hasKeys(keys, reqKeys)) {
    throwErr(`Missing column in <${context.actionsTable}> table, should have: ${reqKeys.join(", ")}`) }
  // Import active modules and build their dict
  const names = data.name;
  const jss = data.js;
  const actives = data.active;
  for (let i = 0; i < names.length; i++) {
    if (actives[i]) {
      if (!names[i]) { throwErr(`Module name cannot be empty`); }
      try { modules[names[i]] = await import(`data:text/javascript,${jss[i]}`) }
      catch (err) { throwErr(`While importing <${names[i]}> module: ${err}`); }
    }
  }
  context.modules = modules;
  // console.error("loadModules:", modules);
}

// Get the actual function from its name

function getActionFn(context, action, name) {
  const ps = name.split(".", 2);
  const length = ps.length;
  let fn = null;
  try {
    if (length == 2) { fn = context.modules[ps[0]][ps[1]]; }  // module fn
    else if (length == 1 && ps[0]) { fn = window[ps[0]]; }  // global fn
    if (!fn) { throw new Error(`Function <${name}> not found`); }
    return fn;
  } catch(err) {
    throwErr(`Getting function <${name}> of <${action.label}> action: ${err}`);
  }
}

async function loadActions(context) {
  const actions = [];
  // Get actions table
  const data = await grist.docApi.fetchTable(context.actionsTable);
  const keys = Object.keys(data);
  // Check required keys
  const reqKeys = ["processes", "label", "desc", "color", "isActive", "onclick", "start_status", "end_status"];
  if (!hasKeys(keys, reqKeys)) {
    throwErr(`Missing column in <${context.actionsTable}> table, should have: ${reqKeys.join(", ")}`) }
  // Prepare action record
  await loadModules(context);
  for (let i = 0; i < data.id.length; i++) {
    const action = {};
    keys.forEach(key => { action[key] = data[key][i]; });
    // Check action values
    if (!action.label) { throwErr(`Missing label in action`); }
    if (!Array.isArray(action.processes) || !action.processes[0] == "L") {
        throwErr(`<${context.actionsTable}> table <process> column should be a <Choice List>.`);
    }
    action.processes.shift();  // remove "L"
    // Save the actual functions instead of their names
    if (!action.onclick) { throwErr(`Missing onclick fn in <${action.label}> action`); }
    action.onclick = getActionFn(context, action, action.onclick);
    if (action.isActive) { action.isActive = getActionFn(context, action, action.isActive); }
    // Push to list of actions
    actions.push(action);
  }
  actions.sort((a, b) => a.manualSort - b.manualSort);
  context.actions = actions;
  // console.error("loadActions:", actions);
}

// Inject html

function createButton(context, action, record) {
  const btn = document.createElement("button");
  btn.onclick = () => action.onclick(context, action, record);
  btn.textContent = action.label;
  btn.title = action.desc;
  btn.style.backgroundColor = action.color;
  btn.className = "flowbtn";
  container.appendChild(btn);
  return btn;
}

function createText(context, msg) {
  const para = document.createElement('p');
  para.className = "flowpara";
  const text = document.createTextNode(msg);
  context.container.appendChild(para);
  para.appendChild(text);
  return text;
}

// Listeners

async function onRecord(record, mappings) {
  // Lock to prevent redrawing
  if (lock) {
    lockInterval = setInterval(function() {
      if ( !lock ) { clearInterval(lockInterval); }
    }, 100);
  }
  lock = true;
  // Get mappings
  if (mappings["processField"] && mappings["statusField"] && mappings["errorField"]) {
    context.processField = mappings["processField"];
    context.statusField = mappings["statusField"];
    context.errField = mappings["errorField"];
  } else {
    // req columns not mapped.
    throwErr("Missing column mapping in widget settings");
  }
  // Clean container
  container.replaceChildren();
  // Update actions cache
  if (!context.actions) { await loadActions(context); }
  // Show record validation message
  if (record[context.errField]) {
    createText(context, record[context.errField]);
  }
  // Prepare action buttons
  for (let action of context.actions) {
    // Action available in this record process?
    if (!action.processes || !action.processes.includes(record[context.processField])) { continue; }
    // Action available in this record status?
    if (action.start_status && action.start_status != record[context.statusField]) { continue; }
    // Action active in this context?
    if (action.isActive && !await action.isActive(context, action, record)) { continue; }
    // Create action button
    createButton(context, action, record);
  }
  // Remove panel lock
  lock = false;
}

async function onNewRecord(record, mappings) {
  // Clean container
  await container.replaceChildren();
}

// Execute the widget

function ready(fn) {
  if (document.readyState !== 'loading') { fn(); }
  else { document.addEventListener('DOMContentLoaded', fn); }
}

ready(function() {
  grist.onRecord(onRecord);
  grist.onNewRecord(onNewRecord);
  grist.ready({
    columns: [
      // See: https://support.getgrist.com/widget-custom/#column-mapping
      {
        name: "processField",
        title: "Process",
        optional: false,
        type: "Choice",
        description: "Chosen process for the request",
        allowMultiple: false,
      },
      {
        name: "statusField",
        title: "Status", 
        optional: false,
        type: "Choice",
        description: "Status of the process request",
        allowMultiple: false,
      },
      {
        name: "errorField",
        title: "Error", 
        optional: false,
        type: "Text",
        description: "Record validation displaying error message",
        allowMultiple: false,
      },
      {
        name: "availableFields",
        title: "Available to JS modules", 
        optional: false,
        type: "Any",
        description: "Available columns for javascript modules",
        allowMultiple: true,
      },
    ],
    requiredAccess: 'full',
    allowSelectBy: true});
});

