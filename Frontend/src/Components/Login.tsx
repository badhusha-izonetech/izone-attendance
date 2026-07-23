import { useState, memo } from 'react'
import type { FormEvent } from 'react'
import {
  MdPerson,
  MdLockOutline,
  MdEmail,
  MdKey,
} from 'react-icons/md'
import { authApi } from '../api'

interface LoginProps {
  onLogin: () => void
}

type AuthMode = 'login' | 'forgot' | 'verify_otp'

const Login = memo(function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  
  // States for password reset & OTP flow
  const [enteredOtp, setEnteredOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const [error, setError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')
  const [mode, setMode] = useState<AuthMode>('login')
  const [otpMessage, setOtpMessage] = useState('')
  const [generatedOtp, setGeneratedOtp] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setResetSuccess('')

    if (mode === 'forgot') {
      if (!username.trim() || !email.trim()) {
        setError('Please enter both username and email address')
        return
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000))
      setGeneratedOtp(otp)
      
      setLoading(true)
      authApi.sendOtp(email, otp)
        .then(() => {
          setOtpMessage(`An OTP has been successfully sent to ${email}.`)
          setMode('verify_otp')
        })
        .catch(err => {
          setError(err.message || 'Failed to send OTP email. Please verify your SMTP settings.')
        })
        .finally(() => {
          setLoading(false)
        })
      return
    }

    if (mode === 'verify_otp') {
      if (!enteredOtp.trim()) {
        setError('Please enter the OTP code')
        return
      }
      if (enteredOtp !== generatedOtp) {
        setError('Invalid OTP code. Please enter the correct code sent to your email.')
        return
      }
      if (newPassword.length < 4) {
        setError('Password must be at least 4 characters long')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match')
        return
      }

      // Save password and complete reset
      localStorage.setItem('at_admin_password', newPassword)
      setResetSuccess('Password reset successfully! Log in with your new credentials.')
      
      // Go back to login and clean up reset states
      setMode('login')
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setEnteredOtp('')
      setOtpMessage('')
      setGeneratedOtp('')
      return
    }

    // Default or local password
    const adminPassword = localStorage.getItem('at_admin_password') || 'admin123'
    if (username === 'admin' && password === adminPassword) {
      localStorage.setItem('at_auth', 'true')
      onLogin()
    } else {
      setError('Invalid username or password')
    }
  }

  const handleForgotPassword = () => {
    setMode('forgot')
    setPassword('')
    setShowPassword(false)
    setError('')
    setOtpMessage('')
    setGeneratedOtp('')
    setResetSuccess('')
  }

  const handleBackToLogin = () => {
    setMode('login')
    setError('')
    setOtpMessage('')
    setGeneratedOtp('')
    setResetSuccess('')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Left Panel: Branding & Beautiful Overlapping Spheres */}
        <div className="login-left">
          <div className="login-sphere sphere-1"></div>
          <div className="login-sphere sphere-2"></div>
          <div className="login-sphere sphere-3"></div>

          <div className="login-left-content">
            <span className="welcome-tag">WELCOME</span>
            <h1>ATTENDANCE IZONE</h1>
            <p className="subtitle">
              A comprehensive, real-time employee attendance tracking and leave management platform designed for efficiency.
            </p>
          </div>
        </div>

        {/* Right Panel: Sign In / Forgot Password Form */}
        <div className="login-right">
          <div className="login-sphere sphere-4"></div>
          
          <div className="login-container">
            <div className="login-header">
              <h2>
                {mode === 'login' && 'Sign in'}
                {mode === 'forgot' && 'Reset Password'}
                {mode === 'verify_otp' && 'Verify OTP'}
              </h2>
              <p>
                {mode === 'login' && 'Please enter your credentials to authenticate'}
                {mode === 'forgot' && 'Enter your username and email to generate an OTP'}
                {mode === 'verify_otp' && 'Enter the OTP and set your new password'}
              </p>
            </div>

            {resetSuccess && (
              <div style={{
                color: '#34d399', 
                background: 'rgba(52, 211, 153, 0.1)', 
                border: '1px solid rgba(52, 211, 153, 0.2)', 
                padding: '12px 16px', 
                borderRadius: '10px', 
                fontSize: '13px', 
                textAlign: 'center', 
                marginBottom: '20px',
                lineHeight: '1.5'
              }}>
                {resetSuccess}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {mode !== 'verify_otp' && (
                <div className="form-group">
                  <div className="input-with-icon">
                    <span className="input-field-icon" aria-hidden="true"><MdPerson /></span>
                    <input
                      id="username"
                      type="text"
                      placeholder="User Name"
                      value={username}
                      onChange={e => { setUsername(e.target.value); setError(''); setResetSuccess('') }}
                      autoFocus
                      required
                    />
                  </div>
                </div>
              )}

              {mode === 'login' && (
                <>
                  <div className="form-group">
                    <div className="input-with-icon">
                      <span className="input-field-icon" aria-hidden="true"><MdLockOutline /></span>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); setResetSuccess('') }}
                        required
                      />
                      <button
                        type="button"
                        className="password-text-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>

                  <div className="login-options-row">
                    <label className="remember-me-checkbox">
                      <input type="checkbox" />
                      <span>Remember me</span>
                    </label>
                    <button
                      type="button"
                      className="forgot-password-link"
                      onClick={handleForgotPassword}
                    >
                      Forgot Password?
                    </button>
                  </div>
                </>
              )}

              {mode === 'forgot' && (
                <>
                  <div className="form-group">
                    <div className="input-with-icon">
                      <span className="input-field-icon" aria-hidden="true"><MdEmail /></span>
                      <input
                        id="email"
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError(''); setResetSuccess('') }}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="forgot-password-link back-to-login-row"
                    onClick={handleBackToLogin}
                  >
                    Back to Sign in
                  </button>
                </>
              )}

              {mode === 'verify_otp' && (
                <>
                  <div className="form-group">
                    <div className="input-with-icon">
                      <span className="input-field-icon" aria-hidden="true"><MdKey /></span>
                      <input
                        id="enteredOtp"
                        type="text"
                        placeholder="Enter 6-digit OTP"
                        value={enteredOtp}
                        onChange={e => { setEnteredOtp(e.target.value); setError('') }}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <div className="input-with-icon">
                      <span className="input-field-icon" aria-hidden="true"><MdLockOutline /></span>
                      <input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={e => { setNewPassword(e.target.value); setError('') }}
                        required
                      />
                      <button
                        type="button"
                        className="password-text-toggle"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <div className="input-with-icon">
                      <span className="input-field-icon" aria-hidden="true"><MdLockOutline /></span>
                      <input
                        id="confirmPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="forgot-password-link back-to-login-row"
                    onClick={handleBackToLogin}
                  >
                    Cancel and back to sign in
                  </button>
                </>
              )}
          
              <div className="login-submit-container">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Processing...' : (
                    <>
                      {mode === 'login' && 'Sign in'}
                      {mode === 'forgot' && 'Generate OTP'}
                      {mode === 'verify_otp' && 'Reset Password'}
                    </>
                  )}
                </button>
              </div>

              {error && <p className="error-msg">{error}</p>}
              
              {otpMessage && (
                <div className="otp-msg">
                  <p>{otpMessage}</p>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
})

export default Login
