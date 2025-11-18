# Security Audit Report

**Date**: 2025-01-16  
**Scope**: Full codebase security review  
**Status**: ⚠️ Issues Found - Action Required

---

## 🔴 Critical Issues

### 1. CORS Configuration - Allow All Origins
**Location**: `server/src/index.js:17`, `server/src/index-combined.js:27`

**Issue**: 
```javascript
origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true
```
When `CORS_ORIGIN` is not set, `origin: true` allows **all origins** to access the API.

**Risk**: High - Any website can make requests to your API, leading to:
- CSRF attacks
- Unauthorized API usage
- API key abuse

**Fix**:
```javascript
origin: process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['https://cognito.shuruaat.in', 'https://3.12.155.210']
```

**Action**: Set `CORS_ORIGIN` environment variable on AWS server:
```bash
# On AWS server
echo 'CORS_ORIGIN=https://cognito.shuruaat.in,https://3.12.155.210' >> ~/cognito/server/.env
pm2 restart ai-canvas
```

---

### 2. Content Security Policy Disabled
**Location**: `server/src/index-combined.js:23`

**Issue**:
```javascript
contentSecurityPolicy: false, // Disable CSP for now to allow scripts
```

**Risk**: High - Without CSP, the app is vulnerable to:
- XSS attacks
- Malicious script injection
- Data exfiltration

**Fix**: Implement proper CSP policy:
```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"], // Remove unsafe-inline if possible
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://api.openai.com", "https://generativelanguage.googleapis.com"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  },
}
```

---

## 🟡 Medium Risk Issues

### 3. API Key in URL Query Parameter (Gemini)
**Location**: `server/src/index.js:126`, `server/src/index-combined.js:181`

**Issue**:
```javascript
const url = `${apiHost}/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
```

**Risk**: Medium - API keys in URLs can be:
- Logged in server access logs
- Exposed in browser history
- Leaked in referrer headers

**Fix**: Move API key to request headers (if Gemini API supports it) or use POST body:
```javascript
// Check Gemini API docs for header-based auth
headers: { 
  'Content-Type': 'application/json',
  'X-API-Key': apiKey  // If supported
}
```

**Note**: Verify if Gemini API supports header-based authentication. If not, this is acceptable but less ideal.

---

### 4. User Prompt Not Sanitized
**Location**: `server/src/index.js:85`, `server/src/index-combined.js:140`

**Issue**: User-provided `prompt` is sent directly to AI APIs without sanitization.

**Risk**: Medium - Could potentially:
- Inject malicious instructions in system prompts
- Cause prompt injection attacks
- Lead to unexpected AI behavior

**Fix**: Add basic sanitization:
```javascript
function sanitizePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return '';
  // Remove control characters and limit length
  return prompt
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
    .slice(0, 2000) // Limit length
    .trim();
}

// Usage:
{ type: 'text', text: sanitizePrompt(prompt) || 'Analyze and explain...' }
```

---

### 5. Error Information Disclosure
**Location**: `server/src/index.js:65`, `server/src/index-combined.js:76`

**Issue**:
```javascript
catch (e) {
  return res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
}
```

**Risk**: Medium - Error messages may leak:
- Internal server details
- Stack traces (if not caught properly)
- API structure information

**Fix**: Use generic error messages in production:
```javascript
catch (e) {
  console.error('API Error:', e); // Log full error server-side
  const isDev = process.env.NODE_ENV === 'development';
  return res.status(500).json({ 
    ok: false, 
    error: isDev ? String(e?.message || e) : 'An error occurred. Please try again.' 
  });
}
```

---

### 6. No Authentication/Authorization
**Location**: All API endpoints

**Issue**: API endpoints are completely public with no authentication.

**Risk**: Medium - Anyone can:
- Abuse rate limits
- Consume API quota
- Incur costs

**Fix Options**:
1. **API Key Authentication** (Simple):
```javascript
const API_KEY = process.env.API_KEY;
app.use('/api/', (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
});
```

2. **JWT Tokens** (More secure, for user-based auth)

3. **IP Whitelisting** (For specific use cases)

---

## 🟢 Low Risk / Good Practices

### ✅ Good: Environment Variables
- API keys stored in environment variables (not hardcoded)
- `.env` files properly gitignored
- Using `dotenv` for local development

### ✅ Good: Input Validation
- Image data URLs are validated
- File type whitelist (png, jpeg, jpg, webp)
- File size limits enforced
- Provider validation (openai/gemini only)

### ✅ Good: Rate Limiting
- Express rate limiting implemented
- Configurable limits via environment variables
- Prevents basic DoS attacks

### ✅ Good: Security Headers
- Helmet.js configured (except CSP)
- `x-powered-by` disabled
- Compression enabled

### ✅ Good: Static innerHTML Usage
- `innerHTML` in `hero-modern.tsx` only used for static CSS
- No user-controlled content in innerHTML
- Low XSS risk in this case

---

## 📋 Recommendations Priority

### Immediate (This Week)
1. ✅ **Fix CORS configuration** - Set `CORS_ORIGIN` environment variable
2. ✅ **Enable CSP** - Configure proper Content Security Policy
3. ✅ **Sanitize user prompts** - Add input sanitization

### Short Term (This Month)
4. ⚠️ **Add API authentication** - Implement API key or JWT auth
5. ⚠️ **Improve error handling** - Use generic errors in production
6. ⚠️ **Review Gemini API key usage** - Move to headers if supported

### Long Term
7. 📝 **Add request logging** - Monitor API usage and abuse
8. 📝 **Implement API usage quotas** - Per-user/IP limits
9. 📝 **Add security monitoring** - Alert on suspicious activity
10. 📝 **Regular dependency updates** - Keep packages updated

---

## 🔧 Quick Fix Script

Run this on your AWS server to fix CORS immediately:

```bash
ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com

# Add CORS_ORIGIN to .env
cd ~/cognito/server
echo 'CORS_ORIGIN=https://cognito.shuruaat.in,https://3.12.155.210' >> .env

# Restart app
pm2 restart ai-canvas
```

---

## 📚 Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [CSP Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## ✅ Verification Checklist

After implementing fixes:

- [ ] CORS only allows trusted origins
- [ ] CSP is enabled with proper directives
- [ ] User input is sanitized
- [ ] Error messages don't leak sensitive info
- [ ] API authentication is implemented
- [ ] Rate limiting is configured appropriately
- [ ] All dependencies are up to date
- [ ] Environment variables are set correctly
- [ ] No secrets in code or logs

---

**Report Generated**: 2025-01-16  
**Next Review**: After implementing critical fixes

