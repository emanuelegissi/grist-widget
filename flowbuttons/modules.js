"use strict"; // strict mode

const requestKeys =  ["Request_date", "Requested_by", "Request", "Process", "Status"];

// Duplicate request

export async function duplicateRequest(context, action, record) {
  return await duplicateRecordWrap({
    tableId: "Requests",
    record: record,
    keys: requestKeys,
    confirmText: `<${action.label}> confirmed?`,
  });
}

// Update request status, but only for selected tools

export async function updateRequestStatusOnlySel(context, action, record) {
  if (record.Unsel_goods_ids.length > 0) {  // are there unselected tools?
    // Ask for confirmation
    const confirmText = `Execute <${action.label}> on selected records only?`;
    if (!confirm(confirmText)) { return; }
    // Duplicate request
    const newId = await duplicateRecordWrap({
      tableId: "Requests",
      record: record,
      keys: requestKeys,
      confirmText: null,
      setCursor: false,
    });
    // Move unselected goods to duplicate request   
    await updateRecordsWrap({
      tableId: "Goods",  // children table to split
      ids: record.Unsel_goods_ids,   // list of unselected children ids in parent table
      fs: {"Request": newId, "Select": true},
      confirmText: null,
    });
  }
  // Update original request status
  await updateStatus(context, action, record);
}
