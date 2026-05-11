const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  try {
    // 1. Create Tables if they don't exist
    await sql`
      CREATE TABLE IF NOT EXISTS trip_logs (
        id TEXT PRIMARY KEY,
        date TEXT,
        isoDate TEXT,
        route TEXT,
        type TEXT,
        sched TEXT,
        actual TEXT,
        pax INTEGER,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS system_config (
        id TEXT PRIMARY KEY,
        data JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 2. Handle GET (Fetch all logs)
    if (event.httpMethod === 'GET') {
      const logs = await sql`SELECT * FROM trip_logs ORDER BY isoDate DESC, created_at DESC`;
      const configRow = await sql`SELECT data FROM system_config WHERE id = 'main_config'`;
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          logs, 
          config: configRow[0]?.data || null 
        }),
      };
    }

    // 3. Handle POST (Add/Update log or config)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);

      if (body.type === 'log') {
        const { log } = body;
        await sql`
          INSERT INTO trip_logs (id, date, isoDate, route, type, sched, actual, pax, status)
          VALUES (${log.id}, ${log.date}, ${log.isoDate}, ${log.route}, ${log.type}, ${log.sched}, ${log.actual}, ${log.pax}, ${log.status})
          ON CONFLICT (id) DO UPDATE SET
            date = EXCLUDED.date,
            actual = EXCLUDED.actual,
            pax = EXCLUDED.pax,
            status = EXCLUDED.status
        `;
      } else if (body.type === 'config') {
        await sql`
          INSERT INTO system_config (id, data)
          VALUES ('main_config', ${JSON.stringify(body.config)})
          ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
        `;
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Success' }),
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
