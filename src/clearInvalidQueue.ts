import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const SESSION_FILE = '../session.json';
const LABELER_URL = process.env.LABELER_URL;
const LABELER_DID = process.env.LABELER_DID;

// Function to read session data from session.json
async function getSessionData() {
    const filePath = SESSION_FILE;
    try {
        const fileContents = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(fileContents);
    } catch (error) {
        console.error('Error reading session file:', error);
        throw error;
    }
}
// Function to fetch records and emit acknowledge events
async function processRecords() {
    try {
        const sessionData = await getSessionData();
        const accessJwt = sessionData.accessJwt;
        const pdsUri = sessionData.pdsUri;

        // Common headers used in both requests
        const COMMON_HEADERS = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.7',
            'atproto-proxy': `${LABELER_DID}#atproto_labeler`,
            'authorization': `Bearer ${accessJwt}`,
            'cache-control': 'no-cache',
            'origin': `${LABELER_URL}`,
            'pragma': 'no-cache',
            'priority': 'u=1, i',
            'referer': `${LABELER_URL}/`,
            'sec-ch-ua': '"Not(A:Brand";v="99", "Brave";v="133", "Chromium";v="133"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Linux"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
            'sec-gpc': '1',
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        };

        // URL for fetching records
        const FETCH_RECORDS_URL = `${pdsUri}/xrpc/tools.ozone.moderation.queryStatuses?limit=100&includeMuted=true&sortField=lastReportedAt&sortDirection=asc&reviewState=tools.ozone.moderation.defs%23reviewOpen`;

        // URL for emitting acknowledge event
        const EMIT_EVENT_URL = `${pdsUri}/xrpc/tools.ozone.moderation.emitEvent`;

        async function fetchRecords() {
            try {
                const response = await axios.get(FETCH_RECORDS_URL, { headers: COMMON_HEADERS });
                const records = response.data.subjectStatuses;

                for (const record of records) {
                    if (record.subjectRepoHandle === 'handle.invalid') {
                        await emitAcknowledgeEvent(record.subject.did);
                    }
                }
            } catch (error) {
                console.error('Error fetching records:', error);
            }
        }

        async function emitAcknowledgeEvent(did: string) {
            try {
                const response = await axios.post(EMIT_EVENT_URL, {
                    subject: {
                        $type: 'com.atproto.admin.defs#repoRef',
                        did: did
                    },
                    createdBy: `${LABELER_DID}`,
                    subjectBlobCids: [],
                    event: {
                        $type: 'tools.ozone.moderation.defs#modEventAcknowledge',
                        comment: '',
                        acknowledgeAccountSubjects: false
                    }
                }, { headers: COMMON_HEADERS });
                console.log(`Acknowledge event emitted for DID: ${did}`);
            } catch (error) {
                console.error(`Error emitting acknowledge event for DID: ${did}`, error);
            }
        }

        await fetchRecords();
    } catch (error) {
        console.error('Error processing records:', error);
    }
}

// Run the script
processRecords();