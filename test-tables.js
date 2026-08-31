const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';

fetch(`${url}/rest/v1/?apikey=${key}`).then(res => res.json()).then(data => {
    if (data.paths) console.log(Object.keys(data.paths));
    else console.log(data);
}).catch(console.error);
