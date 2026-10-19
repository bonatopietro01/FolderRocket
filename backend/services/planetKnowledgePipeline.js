function createSerialWorkQueue(){
    let tail=Promise.resolve();
    return {
        run(work){
            const result=tail.catch(()=>{}).then(work);
            tail=result.catch(()=>{});
            return result;
        }
    };
}

function createLatestGenerationSlot(){
    let pending=null;
    return {
        replace(generation){pending=generation;},
        clear(){pending=null;},
        take(){const value=pending;pending=null;return value;},
        get hasPending(){return pending!==null;}
    };
}

module.exports={createSerialWorkQueue,createLatestGenerationSlot};
