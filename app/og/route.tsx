import { ImageResponse } from 'next/og'
 
export const runtime = 'edge'
 
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          backgroundImage: 'linear-gradient(to bottom, #000000, #1a1a1a)',
          fontSize: 60,
          letterSpacing: -2,
          fontWeight: 700,
          textAlign: 'center',
        }}
      >
        <div style={{ 
          backgroundImage: 'linear-gradient(90deg, rgb(0, 124, 240), rgb(0, 223, 216))',
          backgroundClip: 'text',
          '-webkit-background-clip': 'text',
          color: 'transparent',
          padding: '20px',
        }}>
          Quake Live Settings Database
        </div>
        <div style={{ 
          fontSize: 30, 
          background: 'white',
          backgroundClip: 'text',
          '-webkit-background-clip': 'text',
          color: 'transparent',
          marginTop: 20 
        }}>
          Player Settings • Gear • Community Resources
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}

