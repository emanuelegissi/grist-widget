"use strict"; // strict mode

let oldRecord = null;
let editor = null;

function loadMonacoEditor() {
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

async function save(record, mappings) {
  const js = editor.getValue();
  grist.selectedTable.update(
    {id: record.id, fields: {[mappings["jsField"]]: js}}
  );
};

function onRecord(record, mappings) {
  // Save old record
  if (oldRecord) { save(oldRecord, mappings) };
  // Load new record
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
      requiredAccess: 'full',
      columns: [
      {
        name: "jsField",
        title: "Javascript", 
        optional: false,
        type: "Text",
        description: "Javascript code",
        allowMultiple: false,
      },
    ],
  });
}

function ready(fn) {
  if (document.readyState !== 'loading') { fn(); }
  else { document.addEventListener('DOMContentLoaded', fn); }
}

ready(async () => {
  loadMonacoEditor();
  configureGristSettings();
});


