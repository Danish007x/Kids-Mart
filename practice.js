const { json } = require("body-parser");

//health check api
app.get('/health',(req,res)=>{
  res.json({status:'ok',massage:'server is running'})
})
//request count middleware
let totalrequest = 0;
const requestcounter = (req,res,next)=>{
  totalrequest++;
  req.reqcount= totalrequest;
  console.log(`totalrequest:${totalrequest}|${req.method} ${req.url}`)
  next();
};
//header-based role access
const adminauth =(req,res,next)=>{
  const role = req.headers.role
  if(role==="admin"){
    return next()
  }
  return status(403).json({
    error : "forbidden"
  })
};
//product api with validation middleware
app.post('/api/products', async (req, res) => {
  try {
    const {
      name,
      price,
      description,
      category,
      stock,
      images
    } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({
        error: 'name, price, and category are required'
      });
    }

    const product = await Product.create({
      name,
      price,
      description,
      category,
      stock,
      images
    });

    res.status(201).json({
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: error.message
    });
  }
});
//api key rate limiter gloobal errors
const apikeymiddleware = (req,res,next)=>{
  const api = req.headers[x-api-key];
  if (!apikey){
    res.status(401).json({
      error : "API key is required"
    });
  }
  if(api!==API-KEY){
    res.status(403).json({
      error : "invalid api key"
    });
  }
}
// rest api users
app.post('/api/users', async(req , res)=>{
  try{
    const{
      name,
      email,
      password
    }
    if(!name||!email||!password){
            res.status(400).json({
    massage:'name,email,password is required'})
    }
    const user = await user.create({
      name,
      email,
      password
    });
    res.status(201).json({
      massage : 'user created successfully',
      user:{
        id: user.id,
        name:user.name,
        email:user.email
      }
    });
  }catch(error){
    res.status(500).json({
      massage : 'error creating user'
    });
  }
});
//rest api users-get
app.get('/api/usrs', async(req,res)=>{
  try{
    const users = await users.findById(req.params.id);
    if(!users){
      res.status(400).json({
        error : 'user not found'
      });
    }
     res.json({success : true, user})
  }catch(error){
    error : 'error finding users'
  }
});
//rest api users-put
app.put('/api/users',async(req,res)=>{
try{
    const {id}= req.params
    const {name,email,password}= req.body
    const user = await user.findByIdAndUpdate(
      id,
      {
        name,
        email,
        password 
      },
      {
        new: true,
        runvalidators: true
      }
     );
    if(!user){
      res.status(400).json({
        error : 'user not found'
      });
    }
    res.status(200).json({
      massage : 'user updated successfully'
    })
  }catch(error){
    res.status(500).json({
      error : 'error updating the user'
    });
  }
  });
//rest api users-delete
app.delete('/api/delete',async(req,res)=>{
  try
  {
    const {id} = req.params
    const {name,email,password} = req.body
    const user = await user.findByIdAndDelete();
    if(!user){
      res.status(404).json({
        massage : 'user not found'
      });
    }
    res.status(200).json({
      massage : 'user daleted successfully'
    });
  }catch(error){
    res.status(500).json({
      massage : 'error deleting the user'
    });
  }
});