import { GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDbDocumentClient } from '../../src/utilities/dynamoDb';

// Compile-only regression checks: npm run build checks this function without calling AWS.
export async function checkCommandOutputInference(
  client: ReturnType<typeof createDynamoDbDocumentClient>,
) {
  const scan = await client.send(new ScanCommand({ TableName: 'Example' }));
  const query = await client.send(new QueryCommand({ TableName: 'Example' }));
  const get = await client.send(new GetCommand({ TableName: 'Example', Key: { id: '1' } }));
  const put = await client.send(new PutCommand({ TableName: 'Example', Item: { id: '1' } }));
  scan.Items;
  query.Items;
  get.Item;
  // @ts-expect-error Put returns no Items; also catches a regression to an any return type.
  put.Items;
}
