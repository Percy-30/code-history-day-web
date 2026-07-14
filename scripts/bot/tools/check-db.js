const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkDb() {
  const date = '2026-07-10';
  
  console.log(`Verificando registros en daily_content para la fecha ${date}...`);
  const { data: dailyData, error: dailyError } = await supabase
    .from('daily_content')
    .select('id, date, status, created_at')
    .eq('date', date);

  if (dailyError) {
    console.error('Error fetching daily_content:', dailyError);
  } else {
    console.log(`Registros encontrados en daily_content: ${dailyData.length}`);
    console.log(dailyData);
  }

  console.log(`\nVerificando registros en ephemerides para la fecha ${date}...`);
  const { data: ephData, error: ephError } = await supabase
    .from('ephemerides')
    .select('id, display_date, event')
    .eq('display_date', date);

  if (ephError) {
    console.error('Error fetching ephemerides:', ephError);
  } else {
    console.log(`Registros encontrados en ephemerides: ${ephData.length}`);
    console.log(ephData);
  }
}

checkDb();
