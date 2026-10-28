import mongoose from 'mongoose';
const schema = new mongoose.Schema({ user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true}, type:{type:String,enum:['topup','ride_payment','coin_reward','withdrawal','refund'],required:true}, amount:{type:Number,required:true,min:0}, currency:{type:String,default:'NGN'}, status:{type:String,enum:['pending','processing','success','failed'],default:'pending',index:true}, reference:{type:String,required:true,unique:true,index:true}, providerTransactionId:String, balanceAfter:{type:Number,min:0}, meta:{type:mongoose.Schema.Types.Mixed,default:{}}, createdAt:{type:Date,default:Date.now} },{timestamps:true});
schema.index({user:1,createdAt:-1});
export default mongoose.model('WalletTransaction',schema);
