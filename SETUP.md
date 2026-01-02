# Backend Setup Instructions

## Environment Variables

Create a `.env.local` file in the `apps/backend/` directory with the following variables:

```env
MONGODB_URI=mongodb://localhost:27017/habbit
JWT_SECRET=your-secret-key-change-in-production
```

### MongoDB Setup Options

1. **Local MongoDB:**
   - Install MongoDB locally
   - Start MongoDB service
   - Use: `mongodb://localhost:27017/habbit`

2. **MongoDB Atlas (Cloud):**
   - Create account at https://www.mongodb.com/cloud/atlas
   - Create a cluster
   - Get connection string
   - Use: `mongodb+srv://username:password@cluster.mongodb.net/habbit`

## Important Notes

- The `.env.local` file is gitignored and should not be committed
- Change `JWT_SECRET` to a strong random string in production
- Make sure MongoDB is running before starting the backend server
