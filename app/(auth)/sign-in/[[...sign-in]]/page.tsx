import { SignIn } from '@clerk/nextjs'

export default function Page() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 50%, #0a0a0f 100%)',
      padding: '24px',
    }}>
      {/* Aurelin logo above the card */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 28,
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '-0.3px',
      }}>
        <span style={{
          width: 10, height: 10,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c5cfc, #5b8dee)',
          display: 'inline-block',
          boxShadow: '0 0 10px #7c5cfc80',
        }} />
        Aurelin
      </div>
      <SignIn />
    </div>
  )
}