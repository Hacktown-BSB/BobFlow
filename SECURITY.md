# Security Guidelines for Watsonx Hackathon

## 🔒 Credential Management

### ✅ DO:

- ✅ Use environment variables for ALL credentials
- ✅ Copy `.env.example` to `.env` and add your credentials there
- ✅ Keep `.env` in `.gitignore` (already configured)
- ✅ Use `process.env.VARIABLE_NAME` in your code
- ✅ Review your commits before pushing (`git diff`)
- ✅ Use placeholders when asking AI assistants for help

### ❌ DON'T:

- ❌ Never hardcode API keys in your code
- ❌ Never commit `.env` files
- ❌ Never share credentials in code comments
- ❌ Never commit files with "credential", "secret", or "password" in the name
- ❌ Never remove patterns from `.gitignore` or `.bobignore`
- ❌ Never paste credentials in AI assistant prompts

## 🤖 Using AI Assistants Safely (Bob, Copilot, etc.)

### The Risk

AI assistants log your prompts and code in session history files. If you share credentials with them, those credentials may be logged!

### Safe Practices:

```
❌ BAD:  "Here's my API key: abc123xyz, help me use it"
✅ GOOD: "Help me use environment variables for my API key"

❌ BAD:  "Read my .env file and help me debug"
✅ GOOD: "Help me structure my .env file (I'll add credentials myself)"

❌ BAD:  api_key = "abc123xyz"
✅ GOOD: api_key = os.getenv('API_KEY')
```

### Protection:

- `.bobignore` prevents Bob from logging credential patterns
- `.gitignore` prevents session files from being committed
- But YOU must not share credentials in prompts!

## 🚨 What Happens if You Expose Credentials?

If you accidentally commit credentials:

1. Your IBM Cloud account will be suspended immediately
2. You must remove the credential from repository history
3. You must rotate/revoke the exposed credential
4. Your account will be restored after verification

## 📝 How to Use Environment Variables

### Node.js / JavaScript

```javascript
require("dotenv").config();
const apiKey = process.env.IBM_CLOUD_API_KEY;
```

### Python

```python
import os
from dotenv import load_dotenv
load_dotenv()
api_key = os.getenv('IBM_CLOUD_API_KEY')
```

### Java

```java
String apiKey = System.getenv("IBM_CLOUD_API_KEY");
```

## 🔍 Before You Commit Checklist

- [ ] No hardcoded credentials in code
- [ ] `.env` file is NOT staged for commit
- [ ] No files with credentials in their name
- [ ] Reviewed `git diff` for sensitive data
- [ ] All credentials are in environment variables
- [ ] No credentials shared with AI assistants

## 🆘 Need Help?

Contact hackathon support through the mentor channel.

## 📚 Additional Resources

- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [IBM Cloud Security](https://cloud.ibm.com/docs/account?topic=account-security)
- [Environment Variables Guide](https://12factor.net/config)