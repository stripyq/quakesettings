import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const dynamic = 'force-static'

export default async function InfographicOG() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 72,
          background: 'linear-gradient(to right, #1a1a1a, #2a2a2a)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px',
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #00a2ff, #0066cc)',
            marginRight: '20px',
          }} />
          <div style={{
            fontSize: '48px',
            fontWeight: 'bold',
          }}>
            Quake Live
          </div>
        </div>
        <div style={{
          backgroundImage: 'linear-gradient(90deg, rgb(0, 124, 240), rgb(0, 223, 216))',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          fontSize: '64px',
          fontWeight: 'bold',
          marginBottom: '20px',
        }}>
          Player Gear Statistics
        </div>
        <div style={{
          fontSize: '36px',
          color: '#888',
        }}>
          2024 Snapshot
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 600,
    }
  )
}

