import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

export function createTextSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })
}

