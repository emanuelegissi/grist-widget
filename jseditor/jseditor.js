"use strict"; // strict mode

let oldRecord = null;
let editor = null;

async function loadMonacoEditor() {
  console.error("Loading Monaco");
  require.config(
    {paths: {'vs': 'https://unpkg.com/monaco-editor@0.33.0/min/vs'}}
  );
  require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editorContainer'), {
      value: "Loading...",
      language: 'javascript',
      automaticLayout: true,
      minimap: { enabled: false },
      folding: false,
      lineNumbers: 'off',
    });
  });
}

function save(record, mappings) {
  console.error("Saving:", editor, record);
  const js = editor.getValue();
  grist.selectedTable.update(
    {id: record.id, fields: {[mappings["jsField"]]: js}}
  );
};

function onRecord(record, mappings) {
  // Save old record
  if (oldRecord) { save(oldRecord, mappings) };
  // Load new record
  console.error("Set Monaco value", editor, record);
  editor.setValue(record[mappings["jsField"]]);
  // Set current as old record
  oldRecord = record;
  // Set save button onclick fn
  const btn = document.getElementById('savebtn');
  btn.onclick = () => save(record, mappings);
}

// Execute the widget

async function configureGristSettings() {
  grist.onRecord(onRecord);
  grist.ready({
      columns: [
      // See: https://support.getgrist.com/widget-custom/#column-mapping
      {
        name: "jsField",
        title: "Javascript", 
        optional: false,
        type: "Text",
        description: "Javascript code",
        allowMultiple: false,
      },
    ],
    requiredAccess: 'full',
  });
}

function ready(fn) {
  if (document.readyState !== 'loading') { fn(); }
  else { document.addEventListener('DOMContentLoaded', fn); }
}

ready(async () => {
  await loadMonacoEditor();
  await configureGristSettings();
});


