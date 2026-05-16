async function loadRealData() {
  try {
    const [meds, inv, sales, purchases, sb] = await Promise.all([
      apiCall('/api/medicines'),
      apiCall('/api/inventory'),
      apiCall('/api/sales'),
      apiCall('/api/purchases'),
      apiCall('/api/shortbook')
    ]);
    
    if (meds.data) STATE.medicines = meds.data;
    
    if (inv.data) {
      STATE.inventory = inv.data.map(item => {
        // Look for the name in 'medicines' object OR 'medicine_name' field
        let name = 'Unknown Medicine';
        if (item.medicines && item.medicines.name) {
          name = item.medicines.name;
        } else if (item.medicine_name) {
          name = item.medicine_name;
        }
        
        return {
          ...item,
          medicine_name: name
        };
      });
    }

    if (sales.data) STATE.sales = sales.data;
    if (purchases.data) STATE.purchases = purchases.data;
    if (sb.data) STATE.shortBook = sb.data;

    refreshDashboard();
    renderMedicineGrid();
    refreshInventory(); // Added this to refresh the table immediately
  } catch (e) {
    console.error("Load Error:", e);
    showToast('Failed to load data from server', 'error');
  }
}
