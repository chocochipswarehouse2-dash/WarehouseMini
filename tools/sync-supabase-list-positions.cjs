const { createClient } = require('@supabase/supabase-js');

const key = 'd4d21774e001c525d41aabbbb9b9940a';
const token = 'ATTA24c8656d86fe6a0499a0e81d8c8f2f0f200ec6e7d52a9259646c1e84e03943ac56487FCC';
const boardId = 'zCN7H9VD';

const supabaseUrl = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const supabaseKey = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching live lists from Trello...');
  const resLists = await fetch(`https://api.trello.com/1/boards/${boardId}/lists?key=${key}&token=${token}&filter=open`);
  const lists = await resLists.json();
  console.log('Total live lists:', lists.length);

  // Sort lists by pos ascending
  lists.sort((a, b) => Number(a.pos) - Number(b.pos));
  const listMap = new Map();
  lists.forEach((l, idx) => {
    listMap.set(l.id, {
      pos: Number(l.pos),
      index: idx,
      name: l.name
    });
  });

  console.log('Fetching cards in Supabase trello_up_catalog...');
  const { data: cards, error: fetchErr } = await supabase
    .from('trello_up_catalog')
    .select('*');

  if (fetchErr) {
    console.error('Fetch error:', fetchErr);
    return;
  }

  console.log(`Found ${cards.length} cards in Supabase.`);

  let updatedCount = 0;
  const chunkSize = 50;

  for (let i = 0; i < cards.length; i += chunkSize) {
    const chunk = cards.slice(i, i + chunkSize);
    const updates = chunk.map(card => {
      const listInfo = listMap.get(card.list_id);
      const listPos = listInfo ? listInfo.pos : 9999999;
      const listIndex = listInfo ? listInfo.index : 9999;
      const currentRaw = card.raw_json || {};

      return {
        ...card,
        raw_json: {
          ...currentRaw,
          list_pos: listPos,
          list_index: listIndex,
          list_name: card.list_name
        }
      };
    });

    const { error: upsertErr } = await supabase
      .from('trello_up_catalog')
      .upsert(updates, { onConflict: 'id' });

    if (upsertErr) {
      console.error(`Chunk ${i} error:`, upsertErr);
    } else {
      updatedCount += chunk.length;
    }
  }

  console.log(`Successfully updated ${updatedCount} / ${cards.length} cards in Supabase with list_pos and list_index.`);
}

main().catch(console.error);
