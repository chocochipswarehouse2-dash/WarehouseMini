const fs = require('fs');
let content = fs.readFileSync('src/components/PickingTasksView.tsx', 'utf8');

content = content.replace(`            const reqQty = Math.max(1, Number(item.qty_req) || 1);
            const pickedQty = Math.max(0, Number(item.qty_picked) || 0);
            const isCompleted = pickedQty >= reqQty;
            if (hideCompleted && isCompleted) return null;
            if (!item) return null;
            const reqQty = Math.max(1, Number(item.qty_req) || 1);
            const pickedQty = Math.max(0, Number(item.qty_picked) || 0);
            const isCompleted = pickedQty === reqQty;`,
            `            if (!item) return null;
            const reqQty = Math.max(1, Number(item.qty_req) || 1);
            const pickedQty = Math.max(0, Number(item.qty_picked) || 0);
            const isCompleted = pickedQty >= reqQty;
            if (hideCompleted && isCompleted) return null;`);

content = content.replace('`\\\\s*\\\\(?\\\\[?\\\\s*${item.size}\\\\s*\\\\]?\\\\)?\\\\s*$`, \'i\')', 
                          '`\\\\s*\\\\(?\\\\[?\\\\s*` + item.size + `\\\\s*\\\\]?\\\\)?\\\\s*$`, \'i\')');

// also, let's fix the other error: Expected ")" but found "$" in line 2668
// Oh, the error was because I broke something with regex maybe?
// Wait, the error was: `supabaseData.map((d) => \`${(d.no_sj || '').toUpperCase()}__${(d.sku || '').toUpperCase()}\`)`
// Let's see if that was broken.

fs.writeFileSync('src/components/PickingTasksView.tsx', content, 'utf8');
console.log('Fixed');
