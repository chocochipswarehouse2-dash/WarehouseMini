const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const newItem: ScannedItem = \{[\s\S]*?setScannedData\(\(prev\) => \[\.\.\.prev, newItem\]\);/;

const replacementLogic = `const textToMatch = found ? found.k : text;
    const catToMatch = currentCategory;
    const locToMatch = currentLocation || (found ? found.lokasi || '' : '');

    setScannedData((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.text === textToMatch && item.category === catToMatch && item.location === locToMatch
      );
      
      if (existingIdx >= 0) {
        const updatedItem = {
          ...prev[existingIdx],
          qty: (prev[existingIdx].qty || 1) + 1,
          time: timeStr
        };
        const newArr = [...prev];
        newArr.splice(existingIdx, 1);
        newArr.push(updatedItem);
        return newArr;
      } else {
        const newItem: ScannedItem = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: textToMatch,
          time: timeStr,
          isCategory: false,
          isLocation: false,
          isInvalidSku,
          productName,
          size,
          category: catToMatch,
          location: locToMatch,
          qty: 1,
        };
        return [...prev, newItem];
      }
    });`;

if (regex.test(appContent)) {
  appContent = appContent.replace(regex, replacementLogic);
  console.log("Successfully replaced handleScannedItem logic.");
} else {
  console.log("Still could not find it.");
}

fs.writeFileSync('src/App.tsx', appContent, 'utf8');

