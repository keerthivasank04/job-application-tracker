import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Job Tracker server running on port ${PORT}`);
});

export default app;
