import type {ID,UTCDateTime,PracticeAttempt,AttemptAnswer} from './schema-v1';
/** Phase A: user-created IELTS/DET spelling packs. No share-link wire format yet. */
export interface LearningPack {
 schemaVersion:1; id:ID; name:string; libraryId:ID; libraryVersion:string;
 wordIds:ID[]; order:ID[];
 source:{type:'user'|'teacher';profileId?:ID};
 settings:{learnDirection:'en-zh';reviewDirection:'zh-en';finalCheck:{type:'spelling';mode:'single';timeLimit:number;hintsAllowed:boolean}};
}
export interface FlashcardReview {
 id:ID; sessionId:ID; wordId:ID; direction:'zh-en'; flipped:true;
 rating:'know'|'again'; round:number; reviewedAt:UTCDateTime;
}
export interface LearningSession {
 schemaVersion:1; id:ID; packId:ID; profileId:ID; startedAt:UTCDateTime; updatedAt:UTCDateTime;
 currentStage:'learn'|'learn_complete'|'review'|'review_complete'|'check'|'completed';
 status:'in_progress'|'completed';currentCardId:ID|null;index:number;flipped:boolean;
 /** Only previously unseen words; old words do not repeat English-first introduction. */
 learnQueue:ID[];seenIds:ID[];exposures:{wordId:ID;learnedAt:UTCDateTime}[];
 reviewQueue:ID[];pendingIds:ID[];reviews:FlashcardReview[];round:number;lastReviewedId:ID|null;
 checkAttemptIds:ID[];
}
export interface LearningBundle {pack:LearningPack;session:LearningSession}
export interface LearningCheckBundle {
 sessionId:ID; attempt:PracticeAttempt;
 answers:(AttemptAnswer & {reason:'timeout'|'skip'|null})[];
}
/** Unseen is the absence of a compatible local record; Checked is not mastery. */
export interface LocalStudyState {status:'learning'|'reviewing'|'checked';needsReview?:boolean;reviewedAt?:UTCDateTime}
