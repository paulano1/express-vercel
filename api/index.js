// index.js
const express = require("express");
const axios = require("axios");
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
require('dotenv').config();
const app = express();

var serviceAccount = {
  "type": process.env.TYPE,
  "project_id": process.env.PROJECT_ID,
  "private_key_id": process.env.PRIVATE_KEY_ID,
  "private_key": process.env.PRIVATE_KEY.replace(/\\n/g, '\n'), // Replaces \\n with actual newline characters
  "client_email": process.env.CLIENT_EMAIL,
  "client_id": process.env.CLIENT_ID,
  "auth_uri": process.env.AUTH_URI,
  "token_uri": process.env.TOKEN_URI,
  "auth_provider_x509_cert_url": process.env.AUTH_PROVIDER_X509_CERT_URL,
  "client_x509_cert_url": process.env.CLIENT_X509_CERT_URL
};

app.use(cors());
app.use(express.json())
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.get('/', (req, res) => {
  res.send('Hey this is my API running 🥳')
});


async function createAccount(dob, email, name, role, balance, db) {
  const userRecord = await admin.auth().createUser({
    email: email,
    password: uuidv4().slice(0, 8),
    displayName: name,
  });

  const batch = db.batch();
  const accountRef = db.collection('accounts').doc(userRecord.uid);
  batch.set(accountRef, {
    dob: dob,
    email: email,
    name: name,
    role: role,
    balance: balance,
  });
  await batch.commit();

  return userRecord.uid;
}

function validChildTransfer(from, to, amount, fromData, toData, res, db) {
  return true;
}

app.post('/addChild', async (req, res) => {
  const { name, email, dob, parentId } = req.body;

  if (!name || !email || !dob || !parentId) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }


  const db = admin.firestore()
  try {
    const childId = await createAccount(dob, email, name, 'child', 0, db);
    const batch = db.batch();
    const childRef = db.collection('child').doc(childId);
    batch.set(childRef, {
      name: name,
      parent: parentId,
    });
    const parentChildMapRef = db.collection('parentChildMapping').doc(parentId);
    const parentChildMapSnapshot = await parentChildMapRef.get();
    if (parentChildMapSnapshot.exists) {
      batch.update(parentChildMapRef, {
        [parentId]: admin.firestore.FieldValue.arrayUnion(childId)
      });
    } else {
      // Or set a new array if this is the first child being added
      batch.set(parentChildMapRef, {
        [parentId]: [childId]
      });
    }

    // Commit the batch
    await batch.commit();

    res.status(200).json({ message: 'Child account created successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
);

app.post('/transfer', async (req, res) => {
  const { from, to, amount } = req.body;

  if (!from || !to || !amount) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }

  const db = admin.firestore()
  const fromRef = db.collection('accounts').doc(from);
  const toRef = db.collection('accounts').doc(to);

  const fromSnapshot = await fromRef.get();
  const toSnapshot = await toRef.get();

  if (!fromSnapshot.exists || !toSnapshot.exists) {
    return res.status(404).json({ message: 'Account not found' });
  }

  const fromData = fromSnapshot.data();
  const toData = toSnapshot.data();
  if (fromData.role == 'child') {
    if (validChildTransfer(from, to, amount, fromData, toData, res, db)) {
      return;
    }
  }

  if (fromData.balance < amount) {
    return res.status(400).json({ message: 'Insufficient balance' });
  }

  const batch = db.batch();
  batch.update(fromRef, {
    balance: fromData.balance - amount
  });
  batch.update(toRef, {
    balance: toData.balance + amount
  });

  await batch.commit();

  res.status(200).json({ message: 'Transfer successful' });
}
);

app.post('/deposit', async (req, res) => {
  const { accountId, amount } = req.body;

  if (!accountId || !amount) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }

  const db = admin.firestore()
  const accountRef = db.collection('accounts').doc(accountId);

  const accountSnapshot = await accountRef.get();

  if (!accountSnapshot.exists) {
    return res.status(404).json({ message: 'Account not found' });
  }

  const accountData = accountSnapshot.data();
  if (accountData.role == 'child') {
    //TODO
    return res.status(400).json({ message: 'Cannot deposit to child account' });
  }

  const batch = db.batch();
  batch.update(accountRef, {
    balance: accountData.balance + amount
  });

  await batch.commit();

  res.status(200).json({ message: 'Deposit successful' });
}
);

app.get('/getBalance', async (req, res) => {
  const { accountId } = req.query;

  if (!accountId) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }

  const db = admin.firestore()
  const accountRef = db.collection('accounts').doc(accountId);

  const accountSnapshot = await accountRef.get();

  if (!accountSnapshot.exists) {
    return res.status(404).json({ message: 'Account not found' });
  }

  const accountData = accountSnapshot.data();

  res.status(200).json({ balance: accountData.balance });
}
);


// app.listen(PORT, () => {
//   console.log(`API listening on PORT ${PORT} `);
// });
// Export the Express API
module.exports = app;
