import type {CaseFile} from './conductor.ts';
import type {LibrarySearchHit} from './library-db.ts';
/** Only retrieved or physician-selected excerpts enter the existing privacy review, never a whole book. */
export function libraryHitFile(hit:LibrarySearchHit):CaseFile{
 if(!hit.documentId||!hit.chunkId||!hit.documentName||!Number.isInteger(hit.pageId)||Number(hit.pageId)<1)throw Error('У фрагмента отсутствует привязка к книге и странице.');
 return {name:hit.image?'library-page.jpg':'library-excerpt.txt',...(hit.image?{image:hit.image}:{}),text:hit.content.slice(0,6500),librarySource:{documentId:hit.documentId,chunkId:hit.chunkId,title:hit.documentName,page:hit.pageId!}};
}
